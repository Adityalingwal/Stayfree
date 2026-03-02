import store from "./store";

/**
 * Sarvam AI Streaming Transcription (WebSocket)
 *
 * Uses Sarvam's real-time WebSocket API:
 * - No 30-second limit (unlike REST)
 * - ~200-500ms latency vs ~2000ms for REST
 * - Streams PCM16 at 16kHz in real-time during recording
 * - flush_signal triggers final transcript on hotkey release
 */

const SARVAM_WS_URL =
  "wss://api.sarvam.ai/speech-to-text-streaming?model=saaras:v3&language_code=hi-IN&mode=translit";

export class SarvamStreamingTranscriber {
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private transcriptResolve: ((transcript: string) => void) | null = null;
  private transcriptReject: ((err: Error) => void) | null = null;
  private connectTime: number = 0;

  private getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    const key = process.env.SARVAM_API_KEY || (store.get("sarvamApiKey") as string);
    if (!key) {
      console.error("[Sarvam Stream] ERROR: SARVAM_API_KEY not found");
      return null;
    }
    this.apiKey = key;
    return key;
  }

  async connect(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Sarvam API key not configured");

    // Close any stale connection
    this.disconnect();

    return new Promise((resolve, reject) => {
      this.connectTime = Date.now();

      const url = `${SARVAM_WS_URL}&api-subscription-key=${encodeURIComponent(apiKey)}`;
      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        console.log(
          `[Sarvam Stream] Connected (${Date.now() - this.connectTime}ms)`,
        );
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        console.error("[Sarvam Stream] WebSocket error:", event);
        if (this.transcriptReject) {
          this.transcriptReject(new Error("Sarvam WebSocket error"));
          this.transcriptResolve = null;
          this.transcriptReject = null;
        }
        reject(new Error("Sarvam WebSocket connection failed"));
      };

      this.ws.onclose = (event) => {
        console.log(
          `[Sarvam Stream] Connection closed (code=${event.code})`,
        );
        // If flush() is still waiting, reject
        if (this.transcriptReject) {
          this.transcriptReject(
            new Error(`WebSocket closed before transcript (code=${event.code})`),
          );
          this.transcriptResolve = null;
          this.transcriptReject = null;
        }
      };
    });
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn("[Sarvam Stream] Non-JSON message:", data);
      return;
    }

    // Sarvam sends { transcript: "..." } on flush or VAD completion
    if ("transcript" in parsed) {
      const transcript = (parsed.transcript as string) || "";
      console.log(
        `[Sarvam Stream] transcript in ${Date.now() - this.connectTime}ms: "${transcript}"`,
      );
      if (this.transcriptResolve) {
        this.transcriptResolve(transcript);
        this.transcriptResolve = null;
        this.transcriptReject = null;
      }
    }
  }

  sendChunk(pcm16: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Send raw PCM16 binary frame
    this.ws.send(pcm16);
  }

  flush(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Sarvam WebSocket not connected"));
        return;
      }

      this.transcriptResolve = resolve;
      this.transcriptReject = reject;

      // Signal end of audio — Sarvam returns final transcript
      this.ws.send(JSON.stringify({ type: "flush_signal" }));

      // Safety timeout: 8 seconds
      setTimeout(() => {
        if (this.transcriptReject) {
          this.transcriptReject(new Error("Sarvam flush timeout"));
          this.transcriptResolve = null;
          this.transcriptReject = null;
        }
      }, 8000);
    });
  }

  disconnect(): void {
    if (this.ws) {
      // Clear handlers first to prevent spurious rejection in onclose
      this.transcriptResolve = null;
      this.transcriptReject = null;
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Module-level singleton for the active recording session
let activeTranscriber: SarvamStreamingTranscriber | null = null;

export function getSarvamStreamTranscriber(): SarvamStreamingTranscriber {
  if (!activeTranscriber) {
    activeTranscriber = new SarvamStreamingTranscriber();
  }
  return activeTranscriber;
}
