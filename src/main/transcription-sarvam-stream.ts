import WebSocket from "ws";
import store from "./store";

/**
 * Sarvam AI Streaming Transcription (WebSocket)
 *
 * Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe/ws
 *
 * Protocol:
 * - Connect to wss://api.sarvam.ai/speech-to-text/ws
 * - Auth via "Api-Subscription-Key" header
 * - Send audio as JSON: { "audio": "<base64 PCM16 @ 16kHz>" }
 * - Send flush: { "type": "flush" }
 * - Receive: { "type": "data", "data": { "transcript": "...", ... } }
 */

const SARVAM_WS_URL =
  "wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&language_code=hi-IN&mode=translit";

export class SarvamStreamingTranscriber {
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private transcriptResolve: ((transcript: string) => void) | null = null;
  private transcriptReject: ((err: Error) => void) | null = null;
  private connectTime: number = 0;
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  private getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    const key =
      process.env.SARVAM_API_KEY || (store.get("sarvamApiKey") as string);
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

    this.forceClose();

    return new Promise((resolve, reject) => {
      this.connectTime = Date.now();

      this.ws = new WebSocket(SARVAM_WS_URL, {
        headers: { "Api-Subscription-Key": apiKey },
      });

      this.ws.on("open", () => {
        console.log(
          `[Sarvam Stream] Connected (${Date.now() - this.connectTime}ms)`,
        );
        resolve();
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("error", (err: Error) => {
        console.error("[Sarvam Stream] WebSocket error:", err.message);
        this.rejectPendingFlush(
          new Error(`Sarvam WebSocket error: ${err.message}`),
        );
        reject(new Error(`Sarvam WebSocket connection failed: ${err.message}`));
      });

      this.ws.on("close", (code: number) => {
        console.log(`[Sarvam Stream] Connection closed (code=${code})`);
        this.rejectPendingFlush(
          new Error(`WebSocket closed before transcript (code=${code})`),
        );
      });
    });
  }

  private handleMessage(raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[Sarvam Stream] Non-JSON message:", raw);
      return;
    }

    // Response format: { "type": "data", "data": { "transcript": "..." } }
    if (parsed.type === "data" && parsed.data) {
      const data = parsed.data as Record<string, unknown>;
      const transcript = (data.transcript as string) || "";
      console.log(
        `[Sarvam Stream] transcript in ${Date.now() - this.connectTime}ms: "${transcript}"`,
      );
      this.clearFlushTimeout();
      if (this.transcriptResolve) {
        this.transcriptResolve(transcript);
        this.transcriptResolve = null;
        this.transcriptReject = null;
      }
    } else if (parsed.type === "error") {
      const errMsg = JSON.stringify(parsed.data || parsed);
      console.error("[Sarvam Stream] Server error:", errMsg);
      this.rejectPendingFlush(new Error(`Sarvam server error: ${errMsg}`));
    }
  }

  private rejectPendingFlush(err: Error): void {
    this.clearFlushTimeout();
    if (this.transcriptReject) {
      this.transcriptReject(err);
      this.transcriptResolve = null;
      this.transcriptReject = null;
    }
  }

  private clearFlushTimeout(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }

  sendChunk(pcm16: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Sarvam expects base64-encoded audio in JSON frames
    const b64 = pcm16.toString("base64");
    this.ws.send(JSON.stringify({ audio: b64 }));
  }

  flush(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(
          new Error(
            "Sarvam not connected — check API key and internet connection",
          ),
        );
        return;
      }

      this.transcriptResolve = resolve;
      this.transcriptReject = reject;

      // Flush signal per Sarvam docs: { "type": "flush" }
      this.ws.send(JSON.stringify({ type: "flush" }));

      // Safety timeout: 8 seconds
      this.flushTimeout = setTimeout(() => {
        this.rejectPendingFlush(new Error("Sarvam transcription timed out"));
      }, 8000);
    });
  }

  disconnect(): void {
    this.transcriptResolve = null;
    this.transcriptReject = null;
    this.clearFlushTimeout();
    this.forceClose();
  }

  private forceClose(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

let activeTranscriber: SarvamStreamingTranscriber | null = null;

export function getSarvamStreamTranscriber(): SarvamStreamingTranscriber {
  if (!activeTranscriber) {
    activeTranscriber = new SarvamStreamingTranscriber();
  }
  return activeTranscriber;
}

/**
 * Keep-warm: pre-connect on app launch so first recording has zero connection overhead.
 * Idle WebSocket connections have no billing impact on Sarvam.
 */
export async function warmSarvamConnection(): Promise<void> {
  const langPref = (store.get("languagePreference") as string) || "english";
  if (langPref !== "hindi") return;

  const sarvamKey =
    process.env.SARVAM_API_KEY || (store.get("sarvamApiKey") as string);
  if (!sarvamKey) return;

  try {
    await getSarvamStreamTranscriber().connect();
    console.log("[Sarvam Stream] Keep-warm connection established");
  } catch (err) {
    console.warn(
      "[Sarvam Stream] Keep-warm failed (will retry on first use):",
      err,
    );
  }
}
