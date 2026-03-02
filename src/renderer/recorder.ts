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

function playStartSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Pleasant ascending two-note chime
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.value = 660; // E5
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  gain1.gain.setValueAtTime(0.25, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
  osc1.start(now);
  osc1.stop(now + 0.12);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.value = 880; // A5
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  gain2.gain.setValueAtTime(0, now + 0.06);
  gain2.gain.linearRampToValueAtTime(0.25, now + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
  osc2.start(now + 0.06);
  osc2.stop(now + 0.18);
}

function playStopSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Pleasant descending single tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 660; // E5
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.15); // down to A4
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
  osc.start(now);
  osc.stop(now + 0.15);
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

  // PCM16 streaming (Hindi path)
  private streamingAudioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletDataUrl: string | null = null;
  private isHindiMode: boolean = false;

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

  async startRecording(hindiMode: boolean): Promise<void> {
    if (!this.stream) {
      console.error("[Recorder] Cannot start - no audio stream");
      return;
    }

    // Reset chunks
    this.audioChunks = [];
    this.isHindiMode = hindiMode;

    // --- MediaRecorder (WebM, always runs) ---
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        console.log(
          `[Recorder] Audio chunk received: ${event.data.size} bytes`,
        );
      }
    };

    this.mediaRecorder.onstop = () => {
      this.handleRecordingComplete();
    };

    this.mediaRecorder.start();
    console.log("[Recorder] Recording started (WebM)");

    // --- PCM16 AudioWorklet (Hindi only) ---
    if (hindiMode) {
      await this.startPCM16Streaming();
    }
  }

  private async startPCM16Streaming(): Promise<void> {
    try {
      // Create a dedicated AudioContext at 16kHz for PCM16 capture
      this.streamingAudioCtx = new AudioContext({ sampleRate: 16000 });

      // Load worklet from data: URL (blob: URLs are blocked by Electron CSP)
      if (!this.workletDataUrl) {
        this.workletDataUrl = createWorkletDataUrl();
      }
      await this.streamingAudioCtx.audioWorklet.addModule(this.workletDataUrl);

      // Connect mic stream → worklet
      const source = this.streamingAudioCtx.createMediaStreamSource(
        this.stream!,
      );
      this.workletNode = new AudioWorkletNode(
        this.streamingAudioCtx,
        "pcm16-processor",
      );

      // Forward PCM16 chunks to main process
      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        window.electron.sendAudioChunk(event.data);
      };

      source.connect(this.workletNode);
      // Don't connect to destination — we don't want to hear the mic

      console.log("[Recorder] PCM16 streaming started (16kHz)");
    } catch (error) {
      console.error("[Recorder] Failed to start PCM16 streaming:", error);
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
      this.streamingAudioCtx.close().catch(() => {});
      this.streamingAudioCtx = null;
    }
  }

  stopRecording(): void {
    // Stop PCM16 streaming first (signals flush to main process)
    if (this.isHindiMode) {
      this.stopPCM16Streaming();
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      console.log("[Recorder] Recording stopped");
    }
  }

  private async handleRecordingComplete(): Promise<void> {
    console.log(`[Recorder] Processing ${this.audioChunks.length} chunks...`);

    const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
    console.log(`[Recorder] Total audio size: ${audioBlob.size} bytes`);

    const arrayBuffer = await audioBlob.arrayBuffer();

    window.electron.sendAudioData(arrayBuffer);
    console.log("[Recorder] Audio sent to main process");
  }

  cleanup(): void {
    this.stopPCM16Streaming();
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
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
    window.electron.onStartRecording((hindiMode: boolean) => {
      console.log(`[Recorder] Received START command (hindi=${hindiMode})`);
      playStartSound();
      recorder.startRecording(hindiMode);
    });

    window.electron.onStopRecording(() => {
      console.log("[Recorder] Received STOP command");
      playStopSound();
      recorder.stopRecording();
    });

    window.electron.onCancelRecording(() => {
      console.log("[Recorder] Received CANCEL command");
      // Stop PCM16 first
      recorder["stopPCM16Streaming"]();

      // Cancel: stop recording but don't process audio
      if (
        recorder["mediaRecorder"] &&
        recorder["mediaRecorder"].state !== "inactive"
      ) {
        recorder["mediaRecorder"].onstop = () => {
          console.log("[Recorder] Recording cancelled (audio discarded)");
          recorder["audioChunks"] = [];
        };
        recorder["mediaRecorder"].stop();
      }
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
