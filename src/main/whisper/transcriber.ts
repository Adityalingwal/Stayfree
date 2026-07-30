import { getWhisperServer, WhisperAssetsMissingError } from "./server";
import { wrapPcm16InWav } from "./wav";

/**
 * ASR error codes (D8 recast — internal-only, grep-verified no external
 * consumers). Replaces the old Sarvam-era ErrorCode union
 * (NO_AUDIO/STREAM_TIMEOUT/WS_CLOSED/SERVER_ERROR).
 */
export type ErrorCode =
  | "NO_AUDIO"
  | "NO_TRANSCRIPT"
  | "ENGINE_UNAVAILABLE"
  | "ASR_TIMEOUT"
  | "ASR_FAILED";

export type ErrorAction = "retry";

export class PipelineError extends Error {
  code: ErrorCode;
  action?: ErrorAction;

  constructor(code: ErrorCode, message: string, action?: ErrorAction) {
    super(message);
    this.code = code;
    this.action = action;
  }
}

/** D5 end-to-end timeout budget. */
const READY_TIMEOUT_MS = 4_000;
const ASR_REQUEST_TIMEOUT_MS = 4_500;
const MAX_ATTEMPTS = 2;

/**
 * Single seam: the pipeline calls this one function to turn recorded PCM16
 * audio into a transcript. No formal Transcriber interface (YAGNI for a
 * single implementation) — a future streaming phase swaps the body behind
 * this same call site. See docs/LOCAL-STT-MIGRATION-PLAN.md §1.
 */
export async function transcribePcm(pcm16: Buffer): Promise<string> {
  if (!pcm16 || pcm16.length === 0) {
    // Empty PCM never reaches the HTTP layer — nothing to send.
    throw new PipelineError(
      "NO_AUDIO",
      "No audio detected. Try again and speak a bit louder.",
    );
  }

  let lastError: PipelineError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const server = getWhisperServer();
      await server.ensureReady(READY_TIMEOUT_MS);
      const baseUrl = server.baseUrl;
      if (!baseUrl) {
        throw new Error("Whisper server has no base URL after ensureReady");
      }

      const transcript = await requestTranscript(
        baseUrl,
        pcm16,
        ASR_REQUEST_TIMEOUT_MS,
      );
      const trimmed = transcript.trim();

      if (!trimmed) {
        // Restarting the engine cannot un-silence silence — surface
        // immediately, never retry on an empty result (D4).
        throw new PipelineError(
          "NO_TRANSCRIPT",
          "No speech detected. Try again and speak a bit louder.",
        );
      }

      return trimmed;
    } catch (error) {
      const mapped = mapError(error);
      lastError = mapped;

      if (mapped.code === "NO_TRANSCRIPT" || mapped.code === "NO_AUDIO") {
        throw mapped;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw mapped;
      }

      console.warn(
        `[Whisper] transcribe attempt ${attempt}/${MAX_ATTEMPTS} failed (${mapped.code}) — restarting engine and retrying once`,
      );
      try {
        await getWhisperServer().restart(
          `transcribe attempt ${attempt} failed: ${mapped.code}`,
        );
      } catch (restartError) {
        // The engine could not come back — no point pretending there's a
        // second attempt left.
        throw mapError(restartError);
      }
    }
  }

  throw (
    lastError ??
    new PipelineError(
      "ASR_FAILED",
      "Something went wrong during transcription. Please try again.",
    )
  );
}

async function requestTranscript(
  baseUrl: string,
  pcm16: Buffer,
  timeoutMs: number,
): Promise<string> {
  const wav = wrapPcm16InWav(pcm16);
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/inference`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Whisper server responded ${res.status}`);
    }
    const json = (await res.json()) as { text?: string };
    return json.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function mapError(error: unknown): PipelineError {
  if (error instanceof PipelineError) return error;

  if (error instanceof WhisperAssetsMissingError) {
    return new PipelineError(
      "ENGINE_UNAVAILABLE",
      "Transcription engine not installed — run scripts/setup-whisper.sh",
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new PipelineError(
      "ASR_TIMEOUT",
      "Couldn't get transcript in time. Please try again.",
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/did not become ready|ECONNREFUSED|failed to fetch|fetch failed/i.test(message)) {
    return new PipelineError(
      "ENGINE_UNAVAILABLE",
      "Transcription engine not ready. Please try again.",
    );
  }

  return new PipelineError(
    "ASR_FAILED",
    "Something went wrong during transcription. Please try again.",
  );
}
