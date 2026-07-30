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

export class PipelineError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
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
 *
 * CONCURRENCY WARNING: concurrent calls are unreachable by construction —
 * the pipeline's `isProcessing` guard plus this function's single call site
 * (the audio-captured handler in src/index.ts) guarantee at most one
 * in-flight transcription. whisper-server's behavior under concurrent
 * /inference POSTs is unvalidated (plan §4 risk table) — do NOT introduce
 * parallel callers.
 *
 * `shouldContinue` (optional, FIX 8): staleness check consulted at every
 * retry decision point. When it returns false (the pipeline deadline fired
 * / the pipeline was superseded), no engine restart and no second attempt
 * happen — the mapped error is thrown immediately (the pipeline already
 * ignores results from stale runs). The in-flight HTTP request is NOT
 * force-aborted: it self-settles within ASR_REQUEST_TIMEOUT_MS and its
 * result is discarded by the caller's stale-pipeline check. (Full
 * AbortController plumbing is deferred to the streaming phase.)
 */
export async function transcribePcm(
  pcm16: Buffer,
  shouldContinue?: () => boolean,
): Promise<string> {
  if (!pcm16 || pcm16.length === 0) {
    // Empty PCM never reaches the HTTP layer — nothing to send.
    throw new PipelineError(
      "NO_AUDIO",
      "No audio detected. Try again and speak a bit louder.",
    );
  }

  let lastError: PipelineError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // FIX 8: never START a retry attempt for a stale pipeline (the deadline
    // may have fired while the engine restarted between attempts).
    if (attempt > 1 && shouldContinue && !shouldContinue()) {
      throw (
        lastError ??
        new PipelineError(
          "ASR_TIMEOUT",
          "Transcription was cancelled after reaching its time limit.",
        )
      );
    }
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
      // FIX 8: a stale pipeline (deadline expired) must never restart the
      // engine — the SIGKILL/respawn could hit a server a NEWER recording
      // is about to use. Bail with the mapped error; no restart, no retry.
      if (shouldContinue && !shouldContinue()) {
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
