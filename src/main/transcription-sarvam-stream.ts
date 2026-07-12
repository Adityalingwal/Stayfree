import WebSocket from "ws";
import store from "./store";

/**
 * Sarvam AI Streaming Transcription (WebSocket)
 *
 * Architecture: PERSISTENT CONNECTION
 * ────────────────────────────────────
 * A single WebSocket connection is established on app launch and kept alive
 * for the entire app lifetime. Between recordings only the transcript state
 * is reset — the connection stays open.
 *
 * Sarvam's STT WebSocket has a ~60-70s idle timeout. To prevent the server
 * from closing the connection we send a silent keepalive audio chunk every
 * 30 seconds while idle. If the connection drops for any reason (server
 * timeout, network error, server restart) we auto-reconnect transparently.
 *
 * Protocol (sarvamai SDK v0.1.25):
 *
 * Connect:
 *   URL: wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit
 *   Header: "api-subscription-key": "<key>"   ← lowercase, case-sensitive
 *
 * Send audio chunk:
 *   { "audio": { "data": "<base64 WAV>", "sample_rate": 16000, "encoding": "audio/wav" } }
 *
 * Send flush:
 *   { "type": "flush" }
 *
 * Receive transcript:
 *   { "type": "data", "data": { "transcript": "...", "request_id": "...", ... } }
 */

const SARVAM_WS_URL =
  "wss://api.sarvam.ai/speech-to-text/ws?language-code=hi-IN&model=saaras:v3&mode=translit&flush_signal=true";

/** Keepalive interval — must be well under Sarvam's ~60s idle timeout */
const KEEPALIVE_INTERVAL_MS = 30_000;

/** Delay before auto-reconnect after unexpected close */
const RECONNECT_DELAY_MS = 1_000;

/** Maximum consecutive reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 2;

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

/**
 * Create a tiny silent WAV chunk for keepalive pings.
 * 100ms of silence at 16kHz mono PCM16 = 3200 bytes of zeros.
 */
function createSilentKeepAliveChunk(): string {
  const silentPcm = Buffer.alloc(3200); // 100ms at 16kHz, 16-bit mono = 3200 bytes
  const wav = wrapPcm16InWav(silentPcm);
  return JSON.stringify({
    audio: {
      data: wav.toString("base64"),
      sample_rate: 16000,
      encoding: "audio/wav",
    },
  });
}

export class SarvamStreamingTranscriber {
  private ws: WebSocket | null = null;
  private apiKey: string | null = null;
  private transcriptResolve: ((transcript: string) => void) | null = null;
  private transcriptReject: ((err: Error) => void) | null = null;
  private connectTime = 0;
  private recordingStartTime = 0;
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  // VAD sends interim segments mid-stream even with flush_signal=true — accumulate all of them
  private transcriptSegments: string[] = [];

  // Keepalive & auto-reconnect
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false; // true when we explicitly call shutdown()
  private silentChunkPayload: string | null = null;

  // Connection-in-progress tracking
  private connectPromise: Promise<void> | null = null;

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

  /**
   * Connect to Sarvam WebSocket. Safe to call multiple times:
   * - If OPEN: returns immediately (reuses connection)
   * - If CONNECTING: waits for the in-flight connection (no duplicate)
   * - If CLOSED/null: creates a new connection
   */
  async connect(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Sarvam API key not configured");

    // Reuse existing open connection
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[Sarvam Stream] Reusing warm connection");
      return;
    }

    // If a connection is already in progress, wait for it instead of creating a duplicate
    if (this.connectPromise) {
      console.log("[Sarvam Stream] Waiting for in-flight connection...");
      return this.connectPromise;
    }

    // Cancel any pending auto-reconnect — this manual connect supersedes it
    this.cancelReconnect();

    // Clean up any dead socket without throwing
    this.cleanupSocket();

    this.connectPromise = this.doConnect(apiKey);
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private doConnect(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectTime = Date.now();
      this.intentionalClose = false;

      // Header name must be lowercase — Sarvam gateway is case-sensitive
      this.ws = new WebSocket(SARVAM_WS_URL, {
        headers: { "api-subscription-key": apiKey },
      });

      this.ws.on("open", () => {
        const elapsed = Date.now() - this.connectTime;
        console.log(`[Sarvam Stream] Connected (${elapsed}ms)`);
        this.reconnectAttempts = 0;
        this.startKeepalive();
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
        this.stopKeepalive();
        this.ws = null;
        this.rejectPendingFlush(
          new Error(`WebSocket closed before transcript (code=${code})`),
        );

        // Auto-reconnect if the close was not intentional (server timeout, network drop, etc.)
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });
    });
  }

  // ─── Keepalive ───────────────────────────────────────────────────────────

  private startKeepalive(): void {
    this.stopKeepalive();
    // Pre-compute the silent chunk payload once
    if (!this.silentChunkPayload) {
      this.silentChunkPayload = createSilentKeepAliveChunk();
    }
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(this.silentChunkPayload!);
        } catch {
          // Connection may have broken between the check and send — close handler will reconnect
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  // ─── Auto-Reconnect ─────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return; // already scheduled

    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.warn(
        `[Sarvam Stream] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up. Will retry on next recording.`,
      );
      this.reconnectAttempts = 0;
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `[Sarvam Stream] Auto-reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        console.log("[Sarvam Stream] Auto-reconnect successful");
      } catch (err) {
        console.warn("[Sarvam Stream] Auto-reconnect failed:", err);
        // close handler will trigger another scheduleReconnect
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  /**
   * Force a fresh connection by closing the current one and reconnecting.
   * Used for RETRY scenarios where the server may have stale buffered audio
   * from a previous flush attempt on the same connection (e.g., flush timed
   * out on client but server still processing — its late response would
   * corrupt the next flush result if we reuse the same connection).
   */
  async reconnect(): Promise<void> {
    this.resetSession();
    this.cancelReconnect();
    this.stopKeepalive();
    this.cleanupSocket();
    await this.connect();
  }

  // ─── Recording lifecycle ────────────────────────────────────────────────

  /** Call this when recording actually starts (after connect/reuse) for accurate latency logs. */
  markRecordingStart(): void {
    this.recordingStartTime = Date.now();
    this.transcriptSegments = [];
  }

  /**
   * Reset transcript state between recordings.
   * The WebSocket connection stays alive — only the per-recording state is cleared.
   */
  resetSession(): void {
    this.clearFlushTimeout();
    if (this.transcriptReject) {
      // Don't leave dangling promises — resolve with empty string rather than rejecting
      // to avoid unhandled promise rejections in the pipeline
      this.transcriptResolve?.("");
    }
    this.transcriptResolve = null;
    this.transcriptReject = null;
    this.transcriptSegments = [];
  }

  // ─── Message handling ───────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[Sarvam Stream] Non-JSON message:", raw);
      return;
    }

    if (parsed.type === "data" && parsed.data) {
      const data = parsed.data as Record<string, unknown>;
      const transcript = (data.transcript as string) || "";
      const elapsed = Date.now() - this.recordingStartTime;

      if (this.transcriptResolve) {
        // Response to our flush signal — join with any VAD interim segments collected so far
        if (transcript) this.transcriptSegments.push(transcript);
        const fullTranscript = this.transcriptSegments.join(" ").trim();
        console.log(
          `[Sarvam Stream] transcript in ${elapsed}ms: "${fullTranscript}"`,
        );
        this.clearFlushTimeout();
        this.transcriptResolve(fullTranscript);
        this.transcriptResolve = null;
        this.transcriptReject = null;
      } else {
        // VAD interim segment — accumulate it, will be joined on flush
        if (transcript) {
          this.transcriptSegments.push(transcript);
          console.log(`[Sarvam Stream] segment (+${elapsed}ms): "${transcript}"`);
        }
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

  // ─── Audio sending ──────────────────────────────────────────────────────

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

  flush(timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Sarvam not connected — check API key and internet connection"));
        return;
      }

      this.transcriptResolve = resolve;
      this.transcriptReject = reject;

      const flushStart = Date.now();
      this.ws.send(JSON.stringify({ type: "flush" }));
      console.log(`[Sarvam Stream] flush sent (timeout=${timeoutMs}ms)`);

      // Safety timeout per attempt
      this.flushTimeout = setTimeout(() => {
        const elapsed = Date.now() - flushStart;
        console.warn(
          `[Sarvam Stream] flush timeout after ${elapsed}ms (limit=${timeoutMs}ms)`,
        );
        this.rejectPendingFlush(new Error("Sarvam transcription timed out"));
      }, timeoutMs);
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Cleanly close the socket without triggering auto-reconnect.
   * Call only on: app quit, language switch away from Hindi.
   */
  shutdown(): void {
    this.intentionalClose = true;
    this.cancelReconnect();
    this.stopKeepalive();
    this.resetSession();
    this.cleanupSocket();
    console.log("[Sarvam Stream] Shut down (intentional)");
  }

  /**
   * @deprecated Use resetSession() between recordings. Use shutdown() for app quit.
   * Kept for backward compatibility — maps to shutdown().
   */
  disconnect(): void {
    this.shutdown();
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        if (this.ws.readyState !== WebSocket.CLOSED) {
          this.ws.terminate();
        }
      } catch {
        // ignore — socket may already be destroyed
      }
      this.ws = null;
    }
  }

  // ─── State queries ──────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get isConnecting(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.CONNECTING;
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
 * This is called ONCE at startup. The connection stays alive via keepalive pings
 * and auto-reconnects on drop — no need to call this again after recordings.
 */
export async function warmSarvamConnection(): Promise<void> {
  const sarvamKey =
    process.env.SARVAM_API_KEY || (store.get("sarvamApiKey") as string);
  if (!sarvamKey) return;

  try {
    await getSarvamStreamTranscriber().connect();
    console.log("[Sarvam Stream] Keep-warm connection established");
  } catch (err) {
    console.warn(
      "[Sarvam Stream] Keep-warm failed (will auto-reconnect or retry on first use):",
      err,
    );
  }
}
