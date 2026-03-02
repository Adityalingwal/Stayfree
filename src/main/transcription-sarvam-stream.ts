import WebSocket from "ws";
import store from "./store";

/**
 * Sarvam AI Streaming Transcription (WebSocket)
 *
 * Protocol verified from sarvamai SDK source (v0.1.25):
 *
 * Connect:
 *   URL: wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit
 *   Header: "api-subscription-key": "<key>"   ← lowercase, this is what the server expects
 *
 * Send audio chunk:
 *   { "audio": { "data": "<base64 WAV>", "sample_rate": 16000, "encoding": "audio/wav" } }
 *   NOTE: data must be a complete WAV file (44-byte header + PCM16 samples).
 *         "audio/wav" encoding requires actual WAV format, not raw PCM16.
 *
 * Send flush:
 *   { "type": "flush" }
 *
 * Receive transcript:
 *   { "type": "data", "data": { "transcript": "...", "request_id": "...", ... } }
 */

const SARVAM_WS_URL =
  "wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit";

/**
 * Wrap raw PCM16 samples in a minimal WAV container.
 * Sarvam expects encoding="audio/wav" which means a proper WAV file —
 * raw PCM16 without the header produces an invalid base64 length error.
 */
function wrapPcm16InWav(pcm16: Buffer, sampleRate = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm16.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);   // ChunkSize
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);             // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);              // AudioFormat (PCM = 1)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);       // Subchunk2Size

  return Buffer.concat([header, pcm16]);
}

export class SarvamStreamingTranscriber {
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private transcriptResolve: ((transcript: string) => void) | null = null;
  private transcriptReject: ((err: Error) => void) | null = null;
  private connectTime = 0;
  private recordingStartTime = 0;
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  // Sarvam sends interim VAD transcripts mid-stream; accumulate all segments
  // so the final result is the complete utterance, not just the last VAD chunk.
  private transcriptSegments: string[] = [];

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

    // Reuse existing warm connection — don't reconnect if already open
    if (this.isConnected) {
      console.log("[Sarvam Stream] Reusing warm connection");
      return;
    }
    this.transcriptSegments = [];

    this.forceClose();

    return new Promise((resolve, reject) => {
      this.connectTime = Date.now();

      // Header name must be lowercase — Sarvam gateway is case-sensitive
      this.ws = new WebSocket(SARVAM_WS_URL, {
        headers: { "api-subscription-key": apiKey },
      });

      this.ws.on("open", () => {
        console.log(
          `[Sarvam Stream] Connected (${Date.now() - this.connectTime}ms)`,
        );
        this.transcriptSegments = [];
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
        this.ws = null;
        this.rejectPendingFlush(
          new Error(`WebSocket closed before transcript (code=${code})`),
        );
      });
    });
  }

  /** Call this when recording actually starts (after connect/reuse) for accurate latency logs. */
  markRecordingStart(): void {
    this.recordingStartTime = Date.now();
    this.transcriptSegments = [];
  }

  private handleMessage(raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[Sarvam Stream] Non-JSON message:", raw);
      return;
    }

    // Sarvam sends { "type": "data", "data": { "transcript": "..." } } in two cases:
    //   1. Mid-stream VAD silence detected (interim segment) — transcriptResolve is null
    //   2. Post-flush final response — transcriptResolve is set
    // Accumulate ALL segments; on flush deliver the joined full transcript.
    if (parsed.type === "data" && parsed.data) {
      const data = parsed.data as Record<string, unknown>;
      const segment = (data.transcript as string) || "";
      const elapsed = Date.now() - this.recordingStartTime;

      if (segment) {
        this.transcriptSegments.push(segment);
        console.log(`[Sarvam Stream] segment (+${elapsed}ms): "${segment}"`);
      }

      if (this.transcriptResolve) {
        // This is the response to our flush — deliver combined transcript
        const fullTranscript = this.transcriptSegments.join(" ").trim();
        console.log(
          `[Sarvam Stream] final transcript in ${elapsed}ms: "${fullTranscript}"`,
        );
        this.clearFlushTimeout();
        this.transcriptResolve(fullTranscript);
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
    // Sarvam requires a complete WAV file per chunk (header + PCM16 samples)
    const wav = wrapPcm16InWav(pcm16);
    const frame = {
      audio: {
        data: wav.toString("base64"),
        sample_rate: 16000,
        encoding: "audio/wav",
      },
    };
    this.ws.send(JSON.stringify(frame));
  }

  flush(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // Connection closed — if we accumulated VAD segments, return them
        if (this.transcriptSegments.length > 0) {
          const fallback = this.transcriptSegments.join(" ").trim();
          console.log(`[Sarvam Stream] flush on closed WS — using ${this.transcriptSegments.length} buffered segment(s): "${fallback}"`);
          resolve(fallback);
        } else {
          reject(new Error("Sarvam not connected — check API key and internet connection"));
        }
        return;
      }

      this.transcriptResolve = resolve;
      this.transcriptReject = reject;

      // SttFlushSignal: { "type": "flush" }
      this.ws.send(JSON.stringify({ type: "flush" }));

      // Safety timeout: 8 seconds
      this.flushTimeout = setTimeout(() => {
        // On timeout, if we have buffered VAD segments, use them rather than failing
        if (this.transcriptSegments.length > 0) {
          const fallback = this.transcriptSegments.join(" ").trim();
          console.log(`[Sarvam Stream] flush timeout — using ${this.transcriptSegments.length} buffered segment(s): "${fallback}"`);
          this.clearFlushTimeout();
          if (this.transcriptResolve) {
            this.transcriptResolve(fallback);
            this.transcriptResolve = null;
            this.transcriptReject = null;
          }
        } else {
          this.rejectPendingFlush(new Error("Sarvam transcription timed out"));
        }
      }, 8000);
    });
  }

  disconnect(): void {
    this.transcriptResolve = null;
    this.transcriptReject = null;
    this.transcriptSegments = [];
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
