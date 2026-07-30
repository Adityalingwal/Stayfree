/**
 * Audio Recorder (Renderer Process)
 *
 * Captures microphone audio using Web Audio API / MediaRecorder
 * Also handles recording sound effects via Web Audio API oscillator
 *
 * Two parallel capture paths:
 * - WebM/Opus via MediaRecorder (always) → sent as audio-captured on stop
 * - PCM16 at 16kHz via AudioWorklet (Hindi only) → streamed as audio-chunk-stream during recording
 */

// --- Sound Effects ---

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// "Dew" sound set — modelled on what makes reference dictation sounds pleasant
// (measured): low-mid register (not shrill), a soft ~10ms attack (a 0ms attack
// pops/clicks), a gentle exponential tail, quiet peaks, and DISCRETE notes
// (pitch slides read as cartoonish). Distinct identity from the reference:
// different notes (F4 start; falling FIFTH A4→D4 stop) and slightly longer tail.

// One soft sine note: 10ms attack, exponential decay (tau), auto-cleanup.
function playNote(
  ctx: AudioContext,
  freq: number,
  at: number,
  vol: number,
  tau: number,
  end: number,
): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, now + at);
  gain.gain.linearRampToValueAtTime(vol, now + at + 0.01);
  gain.gain.setTargetAtTime(0, now + at + 0.01, tau);
  osc.start(now + at);
  osc.stop(now + end);
}

function playStartSound(): void {
  // Single soft F4 — a calm "listening" cue.
  playNote(getAudioContext(), 349, 0, 0.13, 0.112, 0.45);
}

function playStopSound(): void {
  // Falling fifth, two discrete notes: A4 → D4 — a settled "done" cue.
  const ctx = getAudioContext();
  playNote(ctx, 440, 0, 0.11, 0.084, 0.35);
  playNote(ctx, 294, 0.1, 0.13, 0.126, 0.55);
}

// --- PCM16 AudioWorklet (inline blob, avoids webpack bundling issues) ---

const WORKLET_CODE = `
const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_S = 0.1;

class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samplesPerChunk = Math.round(TARGET_SAMPLE_RATE * CHUNK_DURATION_S);
    this.buffer = new Float32Array(this.samplesPerChunk);
    this.bufferIndex = 0;
    this.nextSourceIndex = 0;
    this.active = true;
    this.port.onmessage = (e) => {
      if (e.data?.type !== 'stop') return;
      this.emitChunk(this.bufferIndex);
      this.bufferIndex = 0;
      this.active = false;
      this.port.postMessage({ type: 'drained' });
    };
  }

  emitChunk(sampleCount) {
    if (sampleCount <= 0) return;
    const pcm16 = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(
      { type: 'chunk', buffer: pcm16.buffer },
      [pcm16.buffer],
    );
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const inputChannel = input[0];
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    while (this.nextSourceIndex < inputChannel.length) {
      const srcIdx = Math.floor(this.nextSourceIndex);
      this.buffer[this.bufferIndex++] = inputChannel[srcIdx];
      if (this.bufferIndex >= this.samplesPerChunk) {
        this.emitChunk(this.samplesPerChunk);
        this.bufferIndex = 0;
      }
      this.nextSourceIndex += ratio;
    }
    this.nextSourceIndex -= inputChannel.length;
    return true;
  }
}

registerProcessor('pcm16-processor', PCM16Processor);
`;

/** Preserve the final phoneme still moving through the OS audio pipeline. */
const RELEASE_TAIL_CAPTURE_MS = 80;

function createWorkletDataUrl(): string {
  // Use data: URL instead of blob: URL — blob: is blocked by Electron's CSP,
  // but data: is explicitly allowed in script-src.
  return (
    "data:application/javascript;base64," +
    btoa(unescape(encodeURIComponent(WORKLET_CODE)))
  );
}

// --- Audio Recorder ---

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private currentTrack: MediaStreamTrack | null = null;
  private activeSessionId: string | null = null;
  private preferredDeviceId = "";
  private streamRefreshPromise: Promise<MediaStream> | null = null;
  private refreshQueued = false;
  private queuedRefreshReason = "";
  private deviceChangeTimer: number | null = null;
  private muteRecoveryTimer: number | null = null;
  private refreshAfterRecording = false;
  private removeSelectedMicListener: (() => void) | null = null;
  private destroyed = false;

  // PCM16 streaming (Hindi path)
  private streamingAudioCtx: AudioContext | null = null;
  private streamingSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletDataUrl: string | null = null;
  private workletModuleReady: Promise<void> | null = null;
  private workletDrainResolve: (() => void) | null = null;
  private isHindiMode = false;
  private pcmChunkCount = 0;
  private pcmBytes = 0;
  private rmsSum = 0;
  private rmsMax = 0;
  private rmsCount = 0;
  private baselineRmsSum = 0;
  private baselineRmsCount = 0;
  private voicedMs = 0;
  private recordingStartMs = 0;
  private streamingFailed = false;

  // Live level meter (drives the widget waveform) — works for both English and
  // Hindi paths since both share this.stream.
  private levelAnalyser: AnalyserNode | null = null;
  private levelSource: MediaStreamAudioSourceNode | null = null;
  private levelData: Float32Array | null = null;
  private levelTimer: number | null = null;

  private readonly baselineWindowMs = 300;
  private readonly chunkDurationMs = 100;
  private readonly minVoicedMs = 180;
  private readonly minDelta = 0.0035;
  private readonly baselineMultiplier = 2.0;
  private readonly deviceChangeDebounceMs = 500;
  private readonly mutedRecoveryDelayMs = 1500;

  async initialize(): Promise<void> {
    const settings = await window.electron.getSettings().catch((error) => {
      console.warn("[Recorder] Could not load microphone preference:", error);
      return null;
    });
    this.preferredDeviceId = settings?.selectedMicId ?? "";

    navigator.mediaDevices.addEventListener(
      "devicechange",
      this.handleDeviceChange,
    );
    this.removeSelectedMicListener = window.electron.onSelectedMicChanged(
      (deviceId) => {
        this.preferredDeviceId = deviceId;
        console.log(
          `[Recorder] Microphone preference changed: ${deviceId || "system default"}`,
        );
        this.scheduleStreamRefresh("microphone preference changed", 0);
      },
    );

    try {
      await this.refreshStream("initialization", true);
      await this.prepareStreamingContext();
      console.log("[Recorder] Initialized and ready");
    } catch (error) {
      // Keep the recorder alive even if no device is currently available.
      // A later devicechange or recording attempt will retry automatically.
      console.error("[Recorder] Initial microphone setup failed:", error);
    }
  }

  async startRecording(hindiMode: boolean, sessionId: string): Promise<void> {
    if (
      this.activeSessionId ||
      (this.mediaRecorder && this.mediaRecorder.state !== "inactive")
    ) {
      console.warn(
        `[Recorder] Ignoring START for ${sessionId}; ${this.activeSessionId} is still active`,
      );
      return;
    }

    // Claim the session before awaiting device recovery. If STOP arrives while
    // getUserMedia is still pending, stopRecording can cancel this attempt
    // instead of letting recording begin after the user has released the key.
    this.activeSessionId = sessionId;

    try {
      const stream = await this.ensureHealthyStream("recording start");
      if (this.activeSessionId !== sessionId) return;

      // Reset chunks
      const recordingChunks: Blob[] = [];
      this.audioChunks = recordingChunks;
      this.isHindiMode = hindiMode;
      this.resetStreamingStats();
      this.recordingStartMs = Date.now();

      // --- MediaRecorder (WebM, always runs) ---
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      this.mediaRecorder = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunks.push(event.data);
          console.log(
            `[Recorder] Audio chunk received: ${event.data.size} bytes`,
          );
        }
      };
      mediaRecorder.onerror = () => {
        this.abortActiveRecording(
          "The microphone stopped while recording. Please try again.",
        );
      };

      // --- PCM16 AudioWorklet (Hindi only) ---
      if (hindiMode) {
        await this.startPCM16Streaming(sessionId);
      }
      if (this.activeSessionId !== sessionId) return;

      mediaRecorder.start();
      playStartSound();
      window.electron.sendRecorderStarted(sessionId);
      console.log(`[Recorder] Recording started (WebM, session=${sessionId})`);

      // --- Live level meter (both paths) ---
      this.startLevelMeter();
    } catch (error) {
      if (this.activeSessionId !== sessionId) return;
      const message = this.describeMicrophoneError(error);
      console.error(`[Recorder] Cannot start ${sessionId}:`, error);
      this.activeSessionId = null;
      this.mediaRecorder = null;
      this.audioChunks = [];
      window.electron.sendRecorderError(sessionId, message);
    }
  }

  private buildAudioConstraints(deviceId = ""): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
  }

  private isStreamHealthy(): boolean {
    const track = this.stream?.getAudioTracks()[0];
    return Boolean(
      track &&
        track.readyState === "live" &&
        track.enabled &&
        !track.muted,
    );
  }

  private async ensureHealthyStream(reason: string): Promise<MediaStream> {
    if (this.streamRefreshPromise) return this.streamRefreshPromise;
    if (this.isStreamHealthy() && this.stream) return this.stream;
    return this.refreshStream(reason, true);
  }

  private async refreshStream(
    reason: string,
    force = false,
  ): Promise<MediaStream> {
    if (!force && this.isStreamHealthy() && this.stream) return this.stream;
    if (this.streamRefreshPromise) return this.streamRefreshPromise;

    this.streamRefreshPromise = this.acquireFreshStream(reason);
    try {
      return await this.streamRefreshPromise;
    } finally {
      this.streamRefreshPromise = null;
      if (this.refreshQueued && !this.activeSessionId && !this.destroyed) {
        const queuedReason = this.queuedRefreshReason;
        this.refreshQueued = false;
        this.queuedRefreshReason = "";
        window.setTimeout(() => {
          void this.refreshStream(queuedReason, true).catch((error) => {
            console.error("[Recorder] Queued microphone refresh failed:", error);
          });
        }, 0);
      }
    }
  }

  private async acquireFreshStream(reason: string): Promise<MediaStream> {
    console.log(`[Recorder] Refreshing microphone stream (${reason})`);

    let nextStream: MediaStream;
    if (this.preferredDeviceId) {
      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(this.preferredDeviceId),
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "NotAllowedError"
        ) {
          throw error;
        }
        console.warn(
          "[Recorder] Preferred microphone unavailable; falling back to system default:",
          error,
        );
        nextStream = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(),
        });
      }
    } else {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: this.buildAudioConstraints(),
      });
    }

    if (this.destroyed) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw new Error("Recorder window is closing");
    }

    this.replaceStream(nextStream);
    const activeTrack = nextStream.getAudioTracks()[0];
    console.log(
      `[Recorder] Microphone ready: ${activeTrack?.label || "system default"}`,
    );
    return nextStream;
  }

  private replaceStream(nextStream: MediaStream): void {
    const previousStream = this.stream;
    this.stream = nextStream;
    this.currentTrack = nextStream.getAudioTracks()[0] ?? null;

    const track = this.currentTrack;
    if (track) {
      track.addEventListener("ended", () => {
        if (this.currentTrack !== track) return;
        console.warn("[Recorder] Microphone track ended");
        this.handleStreamInvalidated(
          "The microphone was disconnected. StayFree is reconnecting.",
        );
      });
      track.addEventListener("mute", () => {
        if (this.currentTrack !== track) return;
        console.warn("[Recorder] Microphone track muted");
        this.armMutedTrackRecovery(track);
      });
      track.addEventListener("unmute", () => {
        if (this.currentTrack !== track) return;
        console.log("[Recorder] Microphone track resumed");
        this.clearMutedTrackRecovery();
      });
    }

    if (previousStream && previousStream !== nextStream) {
      previousStream.getTracks().forEach((previousTrack) => previousTrack.stop());
    }
  }

  private readonly handleDeviceChange = (): void => {
    console.log("[Recorder] Audio device list changed");
    this.scheduleStreamRefresh("audio device changed");
  };

  private scheduleStreamRefresh(reason: string, delay = this.deviceChangeDebounceMs): void {
    if (this.deviceChangeTimer !== null) {
      window.clearTimeout(this.deviceChangeTimer);
    }
    this.deviceChangeTimer = window.setTimeout(() => {
      this.deviceChangeTimer = null;
      if (this.activeSessionId) {
        this.refreshAfterRecording = true;
        return;
      }
      if (this.streamRefreshPromise) {
        this.refreshQueued = true;
        this.queuedRefreshReason = reason;
        return;
      }
      void this.refreshStream(reason, true).catch((error) => {
        console.error("[Recorder] Automatic microphone recovery failed:", error);
      });
    }, delay);
  }

  private armMutedTrackRecovery(track: MediaStreamTrack): void {
    this.clearMutedTrackRecovery();
    this.muteRecoveryTimer = window.setTimeout(() => {
      this.muteRecoveryTimer = null;
      if (this.currentTrack !== track || !track.muted) return;
      this.handleStreamInvalidated(
        "The microphone stopped sending audio. StayFree is reconnecting.",
      );
    }, this.mutedRecoveryDelayMs);
  }

  private clearMutedTrackRecovery(): void {
    if (this.muteRecoveryTimer !== null) {
      window.clearTimeout(this.muteRecoveryTimer);
      this.muteRecoveryTimer = null;
    }
  }

  private handleStreamInvalidated(message: string): void {
    this.clearMutedTrackRecovery();
    if (this.activeSessionId) {
      this.abortActiveRecording(message);
    }
    const invalidStream = this.stream;
    this.stream = null;
    this.currentTrack = null;
    invalidStream?.getTracks().forEach((track) => track.stop());
    void this.refreshStream("microphone stream invalidated", true).catch(
      (error) => {
        console.error("[Recorder] Microphone reconnection failed:", error);
      },
    );
  }

  private abortActiveRecording(message: string): void {
    const sessionId = this.activeSessionId;
    if (!sessionId) return;

    this.stopLevelMeter();
    void this.stopPCM16Streaming(false);
    const mediaRecorder = this.mediaRecorder;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = () => {
        console.log(`[Recorder] Discarded interrupted session=${sessionId}`);
      };
      try {
        mediaRecorder.stop();
      } catch {
        // The hardware may already have invalidated the recorder.
      }
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    window.electron.sendRecorderError(sessionId, message);
  }

  private describeMicrophoneError(error: unknown): string {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        return "Microphone access is blocked. Allow it in system settings.";
      }
      if (
        error.name === "NotFoundError" ||
        error.name === "OverconstrainedError"
      ) {
        return "No available microphone was found.";
      }
      if (
        error.name === "NotReadableError" ||
        error.name === "AbortError"
      ) {
        return "The microphone is busy or unavailable. Please try again.";
      }
    }
    return "StayFree could not start the microphone. Please try again.";
  }

  // Taps this.stream with an AnalyserNode and emits the RMS level ~30x/sec so
  // the widget waveform reacts to the actual voice (flat when silent, waving
  // when speaking). Uses setInterval, not rAF — the recorder window is hidden
  // and rAF may not tick even with backgroundThrottling disabled.
  private startLevelMeter(): void {
    try {
      if (!this.stream) return;
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => undefined);
      }
      this.levelSource = ctx.createMediaStreamSource(this.stream);
      this.levelAnalyser = ctx.createAnalyser();
      this.levelAnalyser.fftSize = 512;
      this.levelAnalyser.smoothingTimeConstant = 0.4;
      this.levelData = new Float32Array(this.levelAnalyser.fftSize);
      this.levelSource.connect(this.levelAnalyser);
      // Note: intentionally NOT connected to destination (don't play the mic).

      this.levelTimer = window.setInterval(() => {
        if (!this.levelAnalyser || !this.levelData) return;
        this.levelAnalyser.getFloatTimeDomainData(this.levelData);
        let sum = 0;
        for (let i = 0; i < this.levelData.length; i += 1) {
          const v = this.levelData[i];
          sum += v * v;
        }
        const rms = Math.sqrt(sum / this.levelData.length);
        window.electron.sendAudioLevel(rms);
      }, 33);
    } catch (error) {
      console.warn("[Recorder] Level meter failed to start:", error);
    }
  }

  private stopLevelMeter(): void {
    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    if (this.levelSource) {
      try {
        this.levelSource.disconnect();
      } catch {
        // ignore
      }
      this.levelSource = null;
    }
    this.levelAnalyser = null;
    this.levelData = null;
    // Settle the widget waveform back to flat dots.
    try {
      window.electron.sendAudioLevel(0);
    } catch {
      // ignore
    }
  }

  private async startPCM16Streaming(sessionId: string): Promise<void> {
    try {
      // The worklet is prepared during initialization so speech that begins
      // immediately after pressing the hotkey is not lost while addModule loads.
      await this.prepareStreamingContext();
      const ctx = this.streamingAudioCtx;
      if (!ctx) throw new Error("PCM16 audio context unavailable");
      if (ctx.state === "suspended") await ctx.resume();

      if (this.activeSessionId !== sessionId) {
        console.log("[Recorder] PCM16 streaming aborted (recording ended)");
        return;
      }

      // Connect mic stream → worklet
      const stream = this.stream;
      if (!stream) {
        throw new Error("Microphone stream unavailable for PCM16 streaming");
      }
      const source = ctx.createMediaStreamSource(stream);
      this.streamingSource = source;
      this.workletNode = new AudioWorkletNode(ctx, "pcm16-processor");

      // Forward PCM16 chunks to main process
      this.workletNode.port.onmessage = (
        event: MessageEvent<
          | { type: "chunk"; buffer: ArrayBuffer }
          | { type: "drained" }
        >,
      ) => {
        if (event.data.type === "drained") {
          this.workletDrainResolve?.();
          return;
        }
        if (this.activeSessionId !== sessionId) return;
        const pcm = new Int16Array(event.data.buffer);
        this.trackAudioEnergy(pcm);
        window.electron.sendAudioChunk(event.data.buffer, sessionId);
      };

      source.connect(this.workletNode);
      // Don't connect to destination — we don't want to hear the mic

      console.log("[Recorder] PCM16 streaming started (16kHz)");
    } catch (error) {
      console.error("[Recorder] Failed to start PCM16 streaming:", error);
      if (this.activeSessionId === sessionId) {
        this.streamingFailed = true;
      }
      // Non-fatal for the session: WebM capture still runs (used for the
      // saved audio file), but there is NO transcription fallback — the
      // transcript comes only from the streamed PCM16 buffer, so with no
      // chunks streamed the pipeline surfaces a NO_AUDIO error.
    }
  }

  private async prepareStreamingContext(): Promise<void> {
    if (
      this.streamingAudioCtx &&
      this.streamingAudioCtx.state !== "closed" &&
      this.workletModuleReady
    ) {
      await this.workletModuleReady;
      return;
    }

    const ctx = new AudioContext({ sampleRate: 16000 });
    this.streamingAudioCtx = ctx;
    if (!this.workletDataUrl) {
      this.workletDataUrl = createWorkletDataUrl();
    }
    const moduleReady = ctx.audioWorklet.addModule(this.workletDataUrl);
    this.workletModuleReady = moduleReady;
    try {
      await moduleReady;
      console.log(
        `[Recorder] PCM16 processor ready (${ctx.sampleRate}Hz context)`,
      );
    } catch (error) {
      if (this.streamingAudioCtx === ctx) {
        this.streamingAudioCtx = null;
        this.workletModuleReady = null;
      }
      void ctx.close();
      throw error;
    }
  }

  private disconnectPCM16Node(): void {
    this.workletDrainResolve?.();
    this.workletDrainResolve = null;
    if (this.streamingSource) {
      try {
        this.streamingSource.disconnect();
      } catch {
        // ignore
      }
      this.streamingSource = null;
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
  }

  private async stopPCM16Streaming(drainTail = true): Promise<void> {
    const node = this.workletNode;
    if (!node) return;

    if (drainTail) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, RELEASE_TAIL_CAPTURE_MS);
      });
      if (this.workletNode !== node) return;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          if (this.workletDrainResolve === finish) {
            this.workletDrainResolve = null;
          }
          resolve();
        };
        const timeout = window.setTimeout(() => {
          console.warn("[Recorder] PCM16 tail drain timed out");
          finish();
        }, 300);
        this.workletDrainResolve = finish;
        node.port.postMessage({ type: "stop" });
      });
    }

    this.disconnectPCM16Node();
  }

  async stopRecording(sessionId: string): Promise<boolean> {
    if (this.activeSessionId !== sessionId) {
      console.warn(
        `[Recorder] Ignoring stale STOP for ${sessionId}; active=${this.activeSessionId}`,
      );
      return false;
    }

    // Stop the live level meter
    this.stopLevelMeter();

    // Stop PCM16 streaming first (signals flush to main process)
    if (this.isHindiMode) {
      await this.stopPCM16Streaming(true);
    }
    if (this.activeSessionId !== sessionId) return false;

    const mediaRecorder = this.mediaRecorder;
    const recordingChunks = this.audioChunks;
    const hindiMode = this.isHindiMode;
    const stats = hindiMode ? this.buildStreamingStats() : null;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.activeSessionId = null;
      window.electron.sendRecorderError(
        sessionId,
        "The microphone was still reconnecting. Please try again.",
      );
      return false;
    }

    mediaRecorder.onstop = () => {
      void this.handleRecordingComplete(
        sessionId,
        recordingChunks,
        hindiMode,
        stats,
      );
    };
    mediaRecorder.stop();
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    console.log(`[Recorder] Recording stopped (session=${sessionId})`);
    return true;
  }

  private async handleRecordingComplete(
    sessionId: string,
    recordingChunks: Blob[],
    hindiMode: boolean,
    stats: ReturnType<AudioRecorder["buildStreamingStats"]> | null,
  ): Promise<void> {
    console.log(`[Recorder] Processing ${recordingChunks.length} chunks...`);

    const audioBlob = new Blob(recordingChunks, { type: "audio/webm" });
    console.log(`[Recorder] Total audio size: ${audioBlob.size} bytes`);

    const arrayBuffer = await audioBlob.arrayBuffer();

    if (hindiMode && stats) {
      window.electron.sendAudioStreamStats(stats, sessionId);
    }

    window.electron.sendAudioData(arrayBuffer, sessionId);
    console.log(`[Recorder] Audio sent to main process (session=${sessionId})`);
    this.refreshStreamAfterRecordingIfNeeded();
  }

  cancelRecording(sessionId: string): boolean {
    if (this.activeSessionId !== sessionId) return false;

    this.stopLevelMeter();
    void this.stopPCM16Streaming(false);
    const mediaRecorder = this.mediaRecorder;
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.activeSessionId = null;
      this.refreshStreamAfterRecordingIfNeeded();
      return false;
    }

    mediaRecorder.onstop = () => {
      console.log(`[Recorder] Recording cancelled (session=${sessionId})`);
    };
    mediaRecorder.stop();
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    this.refreshStreamAfterRecordingIfNeeded();
    return true;
  }

  private refreshStreamAfterRecordingIfNeeded(): void {
    if (!this.refreshAfterRecording) return;
    this.refreshAfterRecording = false;
    void this.refreshStream("deferred audio device change", true).catch(
      (error) => {
        console.error("[Recorder] Deferred microphone refresh failed:", error);
      },
    );
  }

  private resetStreamingStats(): void {
    this.pcmChunkCount = 0;
    this.pcmBytes = 0;
    this.rmsSum = 0;
    this.rmsMax = 0;
    this.rmsCount = 0;
    this.baselineRmsSum = 0;
    this.baselineRmsCount = 0;
    this.voicedMs = 0;
    this.streamingFailed = false;
  }

  private computeRms(pcm: Int16Array): number {
    if (pcm.length === 0) return 0;
    let squareSum = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      const normalized = pcm[i] / 32768;
      squareSum += normalized * normalized;
    }
    return Math.sqrt(squareSum / pcm.length);
  }

  private trackAudioEnergy(pcm: Int16Array): void {
    this.pcmChunkCount += 1;
    this.pcmBytes += pcm.byteLength;

    const rms = this.computeRms(pcm);
    this.rmsSum += rms;
    this.rmsCount += 1;
    this.rmsMax = Math.max(this.rmsMax, rms);

    const elapsed = Date.now() - this.recordingStartMs;
    if (elapsed <= this.baselineWindowMs) {
      this.baselineRmsSum += rms;
      this.baselineRmsCount += 1;
      return;
    }

    const baseline =
      this.baselineRmsCount > 0
        ? this.baselineRmsSum / this.baselineRmsCount
        : 0.001;
    const speechThreshold = Math.max(
      baseline * this.baselineMultiplier,
      baseline + this.minDelta,
    );
    if (rms >= speechThreshold) {
      this.voicedMs += this.chunkDurationMs;
    }
  }

  private buildStreamingStats() {
    const avgRms = this.rmsCount > 0 ? this.rmsSum / this.rmsCount : 0;
    const baselineRms =
      this.baselineRmsCount > 0 ? this.baselineRmsSum / this.baselineRmsCount : 0;
    const hasSpeech = this.voicedMs >= this.minVoicedMs;
    const isBorderlineSpeech = !hasSpeech && this.voicedMs > 0;

    return {
      chunkCount: this.pcmChunkCount,
      pcmBytes: this.pcmBytes,
      avgRms,
      maxRms: this.rmsMax,
      baselineRms,
      voicedMs: this.voicedMs,
      hasSpeech,
      isBorderlineSpeech,
      streamingFailed: this.streamingFailed,
    };
  }

  cleanup(): void {
    this.destroyed = true;
    navigator.mediaDevices.removeEventListener(
      "devicechange",
      this.handleDeviceChange,
    );
    this.removeSelectedMicListener?.();
    this.removeSelectedMicListener = null;
    if (this.deviceChangeTimer !== null) {
      window.clearTimeout(this.deviceChangeTimer);
      this.deviceChangeTimer = null;
    }
    this.clearMutedTrackRecovery();
    this.stopLevelMeter();
    void this.stopPCM16Streaming(false);
    const streamingAudioCtx = this.streamingAudioCtx;
    this.streamingAudioCtx = null;
    this.workletModuleReady = null;
    if (streamingAudioCtx) {
      void streamingAudioCtx.close().catch((error) => {
        console.warn("[Recorder] Failed to close streaming audio context:", error);
      });
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.currentTrack = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    console.log("[Recorder] Cleaned up");
  }
}

// Create singleton instance
const recorder = new AudioRecorder();

// Register commands immediately. Initialization is allowed to fail and recover
// later, so a temporary missing Bluetooth device can never permanently disable
// the recorder until the app restarts.
window.electron.onStartRecording((hindiMode: boolean, sessionId: string) => {
  console.log(
    `[Recorder] Received START command (hindi=${hindiMode}, session=${sessionId})`,
  );
  void recorder.startRecording(hindiMode, sessionId);
});

window.electron.onStopRecording((sessionId: string) => {
  console.log(`[Recorder] Received STOP command (session=${sessionId})`);
  void recorder.stopRecording(sessionId).then((stopped) => {
    if (stopped) playStopSound();
  });
});

window.electron.onCancelRecording((sessionId: string) => {
  console.log(`[Recorder] Received CANCEL command (session=${sessionId})`);
  recorder.cancelRecording(sessionId);
});

// Initialize on load. The class keeps its device listeners active and retries
// on the next device change or recording attempt if this first call fails.
void recorder.initialize();

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  recorder.cleanup();
});

export default recorder;
