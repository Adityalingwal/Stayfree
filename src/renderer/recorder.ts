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
    this.active = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.active = false; };
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const inputChannel = input[0];
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    const outputLen = Math.floor(inputChannel.length / ratio);
    for (let i = 0; i < outputLen; i++) {
      const srcIdx = Math.floor(i * ratio);
      this.buffer[this.bufferIndex++] = inputChannel[srcIdx];
      if (this.bufferIndex >= this.samplesPerChunk) {
        const pcm16 = new Int16Array(this.samplesPerChunk);
        for (let j = 0; j < this.samplesPerChunk; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm16-processor', PCM16Processor);
`;

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
  private activeSessionId: string | null = null;

  // PCM16 streaming (Hindi path)
  private streamingAudioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletDataUrl: string | null = null;
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

  async initialize(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      console.log("[Recorder] Microphone access granted");
    } catch (error) {
      console.error("[Recorder] Failed to get microphone access:", error);
      throw error;
    }
  }

  async startRecording(hindiMode: boolean, sessionId: string): Promise<void> {
    if (!this.stream) {
      console.error("[Recorder] Cannot start - no audio stream");
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      console.warn(
        `[Recorder] Ignoring START for ${sessionId}; ${this.activeSessionId} is still active`,
      );
      return;
    }

    // Reset chunks
    const recordingChunks: Blob[] = [];
    this.audioChunks = recordingChunks;
    this.activeSessionId = sessionId;
    this.isHindiMode = hindiMode;
    this.resetStreamingStats();
    this.recordingStartMs = Date.now();

    // --- MediaRecorder (WebM, always runs) ---
    const mediaRecorder = new MediaRecorder(this.stream, {
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

    mediaRecorder.start();
    console.log(`[Recorder] Recording started (WebM, session=${sessionId})`);

    // --- Live level meter (both paths) ---
    this.startLevelMeter();

    // --- PCM16 AudioWorklet (Hindi only) ---
    if (hindiMode) {
      await this.startPCM16Streaming(sessionId);
    }
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
      // Create a dedicated AudioContext at 16kHz for PCM16 capture
      const ctx = new AudioContext({ sampleRate: 16000 });
      this.streamingAudioCtx = ctx;

      // Load worklet from data: URL (blob: URLs are blocked by Electron CSP)
      if (!this.workletDataUrl) {
        this.workletDataUrl = createWorkletDataUrl();
      }
      await ctx.audioWorklet.addModule(this.workletDataUrl);

      // A rapid cancel/stop can tear the context down (stopPCM16Streaming)
      // while addModule is still awaiting — the recording is already gone, so
      // just bail instead of throwing on the nulled context.
      if (
        this.streamingAudioCtx !== ctx ||
        this.activeSessionId !== sessionId
      ) {
        console.log("[Recorder] PCM16 streaming aborted (recording ended)");
        return;
      }

      // Connect mic stream → worklet
      const stream = this.stream;
      if (!stream) {
        throw new Error("Microphone stream unavailable for PCM16 streaming");
      }
      const source = ctx.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(ctx, "pcm16-processor");

      // Forward PCM16 chunks to main process
      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (this.activeSessionId !== sessionId) return;
        const pcm = new Int16Array(event.data);
        this.trackAudioEnergy(pcm);
        window.electron.sendAudioChunk(event.data, sessionId);
      };

      source.connect(this.workletNode);
      // Don't connect to destination — we don't want to hear the mic

      console.log("[Recorder] PCM16 streaming started (16kHz)");
    } catch (error) {
      console.error("[Recorder] Failed to start PCM16 streaming:", error);
      if (this.activeSessionId === sessionId) {
        this.streamingFailed = true;
      }
      // Non-fatal: WebM recording still works; main process will handle fallback
    }
  }

  private stopPCM16Streaming(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage("stop");
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.streamingAudioCtx) {
      this.streamingAudioCtx.close().catch((error) => {
        console.warn("[Recorder] Failed to close streaming audio context:", error);
      });
      this.streamingAudioCtx = null;
    }
  }

  stopRecording(sessionId: string): boolean {
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
      this.stopPCM16Streaming();
    }

    const mediaRecorder = this.mediaRecorder;
    const recordingChunks = this.audioChunks;
    const hindiMode = this.isHindiMode;
    const stats = hindiMode ? this.buildStreamingStats() : null;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.activeSessionId = null;
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
  }

  cancelRecording(sessionId: string): boolean {
    if (this.activeSessionId !== sessionId) return false;

    this.stopLevelMeter();
    this.stopPCM16Streaming();
    const mediaRecorder = this.mediaRecorder;
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.activeSessionId = null;
      return false;
    }

    mediaRecorder.onstop = () => {
      console.log(`[Recorder] Recording cancelled (session=${sessionId})`);
    };
    mediaRecorder.stop();
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    return true;
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
    this.stopLevelMeter();
    this.stopPCM16Streaming();
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeSessionId = null;
    console.log("[Recorder] Cleaned up");
  }
}

// Create singleton instance
const recorder = new AudioRecorder();

// Initialize on load
recorder
  .initialize()
  .then(() => {
    console.log("[Recorder] Initialized and ready");

    // Listen for recording commands from main process
    window.electron.onStartRecording((hindiMode: boolean, sessionId: string) => {
      console.log(`[Recorder] Received START command (hindi=${hindiMode}, session=${sessionId})`);
      playStartSound();
      void recorder.startRecording(hindiMode, sessionId);
    });

    window.electron.onStopRecording((sessionId: string) => {
      console.log(`[Recorder] Received STOP command (session=${sessionId})`);
      if (recorder.stopRecording(sessionId)) playStopSound();
    });

    window.electron.onCancelRecording((sessionId: string) => {
      console.log(`[Recorder] Received CANCEL command (session=${sessionId})`);
      recorder.cancelRecording(sessionId);
    });
  })
  .catch((error) => {
    console.error("[Recorder] Initialization failed:", error);
  });

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  recorder.cleanup();
});

export default recorder;
