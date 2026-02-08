/**
 * Audio Recorder (Renderer Process)
 *
 * Captures microphone audio using Web Audio API / MediaRecorder
 * Also handles recording sound effects via Web Audio API oscillator
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

// --- Audio Recorder ---

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

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

  startRecording(): void {
    if (!this.stream) {
      console.error("[Recorder] Cannot start - no audio stream");
      return;
    }

    // Reset chunks
    this.audioChunks = [];

    // Create MediaRecorder with WebM format
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        console.log(`[Recorder] Audio chunk received: ${event.data.size} bytes`);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.handleRecordingComplete();
    };

    this.mediaRecorder.start();
    console.log("[Recorder] Recording started");
  }

  stopRecording(): void {
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
    window.electron.onStartRecording(() => {
      console.log("[Recorder] Received START command");
      playStartSound();
      recorder.startRecording();
    });

    window.electron.onStopRecording(() => {
      console.log("[Recorder] Received STOP command");
      playStopSound();
      recorder.stopRecording();
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
