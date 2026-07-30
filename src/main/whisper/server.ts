import { app } from "electron";
import { spawn, ChildProcess, execFileSync } from "child_process";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";

/**
 * WhisperServer — owns the whisper-server child process lifecycle.
 *
 * Replaces the Sarvam WebSocket transcriber's "persistent connection to a
 * cloud endpoint" model with "warm local sidecar process". See
 * docs/LOCAL-STT-MIGRATION-PLAN.md §2 (D2/D3/D9) for the full rationale.
 *
 * States: stopped -> starting -> ready -> crashed (-> restarting) -> stopping
 *         (+ unavailable = circuit-broken after repeated crashes)
 */

export type WhisperServerStatus =
  | "stopped"
  | "starting"
  | "ready"
  | "crashed"
  | "restarting"
  | "stopping"
  | "unavailable";

/** Decode flags validated in Phase-0 preflight — see docs/whisper-preflight-phase0.md.
 * NO -sns (confirmed: does not remove silence hallucination — D7/plan risk table).
 * NO --convert (no ffmpeg dependency — we always send a proper WAV). */
const DECODE_ARGS = ["-l", "hi", "-nt", "-bs", "1", "-bo", "1", "-t", "4"];

const PORT_RANGE_MIN = 49152;
const PORT_RANGE_MAX = 65535;
const PORT_PICK_ATTEMPTS = 5;

/** Crash backoff schedule (ms) — index = (consecutive crash count - 1), clamped to last entry. */
const CRASH_BACKOFF_MS = [0, 500, 1000, 2000, 4000];
const CRASH_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_MAX_CRASHES = 5;
const CIRCUIT_BREAKER_RETRY_MS = 30_000;

/** Grace period for app-quit shutdown ONLY. A restart() (failed request /
 * crash recovery) always does an immediate SIGKILL — a process being killed
 * because it failed has no state worth preserving. */
const QUIT_GRACE_MS = 2_000;

export class WhisperAssetsMissingError extends Error {
  constructor(detail: string) {
    super(`Whisper engine assets are missing: ${detail}`);
    this.name = "WhisperAssetsMissingError";
  }
}

export interface WhisperAssetPaths {
  root: string;
  binDir: string;
  serverBin: string;
  modelPath: string;
  tmpDir: string;
  stateFile: string;
}

/** Single seam for every asset path the engine touches — see plan §1. */
export function getAssetPaths(): WhisperAssetPaths {
  const root = path.join(app.getPath("userData"), "whisper");
  const binDir = path.join(root, "bin");
  return {
    root,
    binDir,
    serverBin: path.join(binDir, "whisper-server"),
    modelPath: path.join(root, "model", "ggml-swift-q8_0.bin"),
    tmpDir: path.join(root, "tmp"),
    stateFile: path.join(root, "sidecar-state.json"),
  };
}

function assetsPresent(paths: WhisperAssetPaths): boolean {
  return fs.existsSync(paths.serverBin) && fs.existsSync(paths.modelPath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryOnce = (attemptsLeft: number) => {
      const port =
        PORT_RANGE_MIN +
        Math.floor(Math.random() * (PORT_RANGE_MAX - PORT_RANGE_MIN));
      const probe = net.createServer();
      probe.once("error", () => {
        probe.close();
        if (attemptsLeft <= 0) {
          reject(new Error("Could not find a free port for whisper-server"));
        } else {
          tryOnce(attemptsLeft - 1);
        }
      });
      probe.listen(port, "127.0.0.1", () => {
        probe.close(() => resolve(port));
      });
    };
    tryOnce(PORT_PICK_ATTEMPTS);
  });
}

/**
 * Phase-0 preflight (docs/whisper-preflight-phase0.md §2) empirically proved
 * this binary loads the model synchronously in main() before calling
 * listen() — there is no window where the port is open but the model isn't
 * ready. So "first successful HTTP response" IS the readiness signal; no
 * stdout-marker parsing needed.
 */
async function pollReady(baseUrl: string, deadlineTs: number): Promise<void> {
  while (Date.now() < deadlineTs) {
    const remaining = Math.max(50, deadlineTs - Date.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(300, remaining));
    try {
      await fetch(baseUrl + "/", { signal: controller.signal });
      return; // any response (even non-2xx) proves the server is up + ready
    } catch {
      // not up yet — keep polling
    } finally {
      clearTimeout(timer);
    }
    await sleep(50);
  }
  throw new Error("Whisper server did not become ready in time");
}

/** Idempotent per app launch — guards against re-sweeping our own live child. */
let hasSweptZombiesThisLaunch = false;

function sweepZombieIfNeeded(paths: WhisperAssetPaths): void {
  if (hasSweptZombiesThisLaunch) return;
  hasSweptZombiesThisLaunch = true;

  if (!fs.existsSync(paths.stateFile)) return;

  try {
    const raw = fs.readFileSync(paths.stateFile, "utf8");
    const state = JSON.parse(raw) as { pid?: number; executablePath?: string };
    if (state.pid && state.executablePath) {
      let cmd = "";
      try {
        cmd = execFileSync("ps", ["-p", String(state.pid), "-o", "command="], {
          encoding: "utf8",
        }).trim();
      } catch {
        cmd = ""; // no such process — nothing to sweep
      }
      // Validate identity by exact command text before killing — a broad
      // pkill-by-path was rejected in the plan (false-positive risk against
      // an innocent process whose args merely mention the path, e.g. an
      // otool/tail/editor invocation during debugging).
      if (cmd && cmd.includes(state.executablePath)) {
        console.warn(`[Whisper] sweeping orphaned server pid=${state.pid}`);
        try {
          process.kill(state.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  } catch (err) {
    console.warn("[Whisper] zombie sweep failed (non-fatal):", err);
  } finally {
    try {
      fs.unlinkSync(paths.stateFile);
    } catch {
      /* already gone */
    }
  }
}

function resetTmpDirIfNeeded(paths: WhisperAssetPaths): void {
  try {
    if (fs.existsSync(paths.tmpDir)) {
      fs.rmSync(paths.tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(paths.tmpDir, { recursive: true });
  } catch (err) {
    console.warn("[Whisper] failed to reset tmp dir (non-fatal):", err);
  }
}

function persistState(paths: WhisperAssetPaths, pid: number): void {
  try {
    fs.mkdirSync(paths.root, { recursive: true });
    fs.writeFileSync(
      paths.stateFile,
      JSON.stringify({ pid, executablePath: paths.serverBin }),
    );
  } catch (err) {
    console.warn("[Whisper] failed to persist sidecar state (non-fatal):", err);
  }
}

function clearState(paths: WhisperAssetPaths): void {
  try {
    fs.unlinkSync(paths.stateFile);
  } catch {
    /* already gone */
  }
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

export class WhisperServer {
  private status: WhisperServerStatus = "stopped";
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private intentionalStop = false;
  private crashTimestamps: number[] = [];
  private circuitBreakerTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readyWaiters: ReadyWaiter[] = [];
  private startPromise: Promise<void> | null = null;

  get baseUrl(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  getStatus(): { status: WhisperServerStatus; port: number | null } {
    return { status: this.status, port: this.port };
  }

  /** Safe to call multiple times — concurrent callers share the in-flight attempt. */
  async start(): Promise<void> {
    if (this.status === "ready") return;
    if (this.startPromise) return this.startPromise;

    this.intentionalStop = false;
    this.status = "starting";
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    const paths = getAssetPaths();
    sweepZombieIfNeeded(paths);
    resetTmpDirIfNeeded(paths);

    if (!assetsPresent(paths)) {
      this.status = "unavailable";
      const err = new WhisperAssetsMissingError(paths.serverBin);
      this.failReadyWaiters(err);
      throw err;
    }

    try {
      fs.chmodSync(paths.serverBin, 0o755);
    } catch {
      /* best-effort — CopyWebpackPlugin/setup script may not preserve exec bit */
    }

    const port = await pickFreePort();
    const args = [
      "-m",
      paths.modelPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      ...DECODE_ARGS,
      "--tmp-dir",
      paths.tmpDir,
    ];

    const child = spawn(paths.serverBin, args, {
      cwd: paths.binDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.port = port;

    if (child.pid) {
      persistState(paths, child.pid);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      console.log(`[Whisper] ${chunk.toString().trim()}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      console.log(`[Whisper] ${chunk.toString().trim()}`);
    });
    child.on("exit", (code, signal) => this.handleExit(code, signal));
    child.on("error", (err) => {
      console.error("[Whisper] spawn error:", err);
    });

    try {
      await pollReady(`http://127.0.0.1:${port}`, Date.now() + 4_000);
      this.status = "ready";
      this.crashTimestamps = []; // clean ready resets the crash streak
      this.resolveReadyWaiters();
    } catch (err) {
      const mapped = err instanceof Error ? err : new Error(String(err));
      this.failReadyWaiters(mapped);
      throw mapped;
    }
  }

  /**
   * Waits for the server to be usable. If already ready, resolves instantly.
   * If circuit-broken (unavailable), bypasses the 30s cooldown and forces
   * one clean attempt (plan D3: "a dictation's ensureReady may force one
   * clean attempt"). If stopped, starts it. Otherwise (starting/restarting/
   * crashed) waits for the in-flight attempt, bounded by timeoutMs.
   */
  async ensureReady(timeoutMs: number): Promise<void> {
    if (this.status === "ready") return;

    if (this.status === "unavailable" || this.status === "stopped") {
      if (this.circuitBreakerTimer) {
        clearTimeout(this.circuitBreakerTimer);
        this.circuitBreakerTimer = null;
      }
      await this.start();
      return;
    }

    // starting / restarting / crashed: wait for the in-flight attempt.
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.readyWaiters.indexOf(waiter);
        if (idx !== -1) this.readyWaiters.splice(idx, 1);
        reject(new Error("Timed out waiting for whisper server to be ready"));
      }, timeoutMs);

      const waiter: ReadyWaiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.readyWaiters.push(waiter);
    });
  }

  private resolveReadyWaiters(): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((w) => w.resolve());
  }

  private failReadyWaiters(err: Error): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((w) => w.reject(err));
  }

  /** Deliberate restart (failed request retry, or explicit recovery). Always
   * an immediate SIGKILL — no grace period, no backoff, resets crash streak
   * since this isn't counted as an unprompted crash. */
  async restart(reason: string): Promise<void> {
    console.warn(`[Whisper] restart requested: ${reason}`);
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.intentionalStop = true; // suppress the coming exit event's auto-restart
    this.killImmediate();
    this.crashTimestamps = [];
    this.status = "stopped";
    await this.start();
  }

  private killImmediate(): void {
    const child = this.child;
    this.child = null;
    this.port = null;
    if (child && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }

  private handleExit(code: number | null, signal: string | null): void {
    const wasIntentional = this.intentionalStop;
    this.child = null;
    this.port = null;

    if (wasIntentional) {
      // stop() or restart() already own the resulting status transition.
      return;
    }

    console.error(
      `[Whisper] server exited unexpectedly (code=${code} signal=${signal})`,
    );
    this.status = "crashed";
    this.failReadyWaiters(new Error("Whisper server crashed"));
    this.recordCrashAndScheduleRestart();
  }

  private recordCrashAndScheduleRestart(): void {
    const now = Date.now();
    this.crashTimestamps = this.crashTimestamps.filter(
      (t) => now - t < CRASH_WINDOW_MS,
    );
    this.crashTimestamps.push(now);

    if (this.crashTimestamps.length > CIRCUIT_BREAKER_MAX_CRASHES) {
      console.error(
        `[Whisper] circuit breaker tripped (>${CIRCUIT_BREAKER_MAX_CRASHES} crashes/${CRASH_WINDOW_MS}ms) — unavailable, retrying every ${CIRCUIT_BREAKER_RETRY_MS}ms`,
      );
      this.status = "unavailable";
      this.scheduleCircuitBreakerRetry();
      return;
    }

    const idx = Math.min(
      this.crashTimestamps.length - 1,
      CRASH_BACKOFF_MS.length - 1,
    );
    const delay = CRASH_BACKOFF_MS[idx];
    this.status = "restarting";
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start().catch((err) => {
        console.error("[Whisper] auto-restart failed:", err);
      });
    }, delay);
  }

  private scheduleCircuitBreakerRetry(): void {
    if (this.circuitBreakerTimer) clearTimeout(this.circuitBreakerTimer);
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerTimer = null;
      if (this.status === "unavailable") {
        void this.start().catch((err) => {
          console.error("[Whisper] circuit-breaker retry failed:", err);
        });
      }
    }, CIRCUIT_BREAKER_RETRY_MS);
  }

  /** App-quit ONLY: SIGTERM -> 2s grace -> SIGKILL. Clears the sidecar state
   * file since a clean stop leaves no orphan to sweep next launch. */
  async stop(): Promise<void> {
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.failReadyWaiters(new Error("Whisper server stopped"));

    const child = this.child;
    if (!child) {
      this.status = "stopped";
      clearState(getAssetPaths());
      return;
    }

    this.intentionalStop = true;
    this.status = "stopping";

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      child.once("exit", done);
      try {
        child.kill("SIGTERM");
      } catch {
        done();
        return;
      }
      setTimeout(() => {
        if (!settled && this.child === child) {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }, QUIT_GRACE_MS);
    });

    this.child = null;
    this.port = null;
    this.status = "stopped";
    clearState(getAssetPaths());
  }
}

let instance: WhisperServer | null = null;

export function getWhisperServer(): WhisperServer {
  if (!instance) {
    instance = new WhisperServer();
  }
  return instance;
}
