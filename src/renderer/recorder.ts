/**
 * Audio Recorder (Renderer Process)
 *
 * Captures microphone audio using Web Audio API / MediaRecorder
 */

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async initialize(): Promise<void> {
    try {
      // Request microphone access
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

    // Combine all chunks into a single Blob
    const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
    console.log(`[Recorder] Total audio size: ${audioBlob.size} bytes`);

    // Convert Blob to ArrayBuffer for IPC
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Send to main process
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

    // Listen for commands from main process
    window.electron.onStartRecording(() => {
      console.log("[Recorder] Received START command");
      recorder.startRecording();
    });

    window.electron.onStopRecording(() => {
      console.log("[Recorder] Received STOP command");
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
