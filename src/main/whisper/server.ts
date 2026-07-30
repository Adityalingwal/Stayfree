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
 *
 * Post-review hardening (2026-07-30 — docs/reviews/FIX-PLAN-2026-07-30.md):
 * - Every spawn is an `ActiveChild` with a monotonically increasing
 *   generation; the exit handler, intentionalStop flag and port are bound to
 *   that child, so a stale child's late exit can never mutate the state of a
 *   newer one (FIX 1).
 * - Every failed start lands in an explicit terminal state ("crashed" with a
 *   scheduled follow-up, or "unavailable") — never stranded on "starting".
 * - A child that misses the readiness window but is still alive (cold Metal
 *   shader compile, ~7.5s measured) is NOT killed: a background "lateReady
 *   adoption" poll gives it up to LATE_READY_GRACE_MS to converge (FIX 1).
 * - Bind-failure exits during startup retry on a fresh port (max
 *   SPAWN_ATTEMPTS_MAX) without polluting crash accounting (FIX 5 / D2).
 * - `stop()` sets a permanent `shuttingDown` flag before anything else — no
 *   code path can spawn a new child after quit begins (FIX 4).
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

/** Readiness window for a normal (warm-path) spawn — preflight measured
 * ~0.01-0.15s warm, so 4s is generous for everything except a cold Metal
 * shader compile (which the lateReady adoption below handles). */
const SPAWN_READY_TIMEOUT_MS = 4_000;

/** A child still ALIVE after missing SPAWN_READY_TIMEOUT_MS is most likely
 * paying the one-time cold Metal shader compile (~7.5s measured in
 * preflight). Killing it would just start another cold compile — a kill
 * loop that never converges. Instead the attempt fails fast for the caller,
 * but the same child keeps getting polled for this long and is adopted if
 * it turns ready (FIX 1 rule 6). */
const LATE_READY_GRACE_MS = 15_000;

/** Bind-collision retries inside one start attempt (plan D2): a child that
 * exits before ever becoming ready is treated as "our probed port was
 * stolen between probe-close and spawn" — pick another port and retry.
 * These retries are NOT crash-accounted (port collision != crash). */
const SPAWN_ATTEMPTS_MAX = 5;

/** Crash backoff schedule (ms) — index = (consecutive crash count - 1), clamped to last entry. */
const CRASH_BACKOFF_MS = [0, 500, 1000, 2000, 4000];
const CRASH_WINDOW_MS = 60_000;
/** Breaker contract (plan D3 as amended 2026-07-30): the 5th crash inside
 * the rolling 60s window trips the breaker. */
const CIRCUIT_BREAKER_MAX_CRASHES = 5;
const CIRCUIT_BREAKER_RETRY_MS = 30_000;

/** Crash accounting (FIX 1 rule 5): the crash streak is only cleared after
 * the server has been READY this long without crashing. Clearing on every
 * successful readiness (the old behavior) let a ready-then-crash-in-1s loop
 * reset the streak forever, so the breaker could never trip. */
const PROVEN_STABLE_MS = 60_000;

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
      // +1 so PORT_RANGE_MAX itself is reachable (FIX 5 off-by-one).
      const port =
        PORT_RANGE_MIN +
        Math.floor(Math.random() * (PORT_RANGE_MAX - PORT_RANGE_MIN + 1));
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
      let exe = "";
      try {
        exe = execFileSync("ps", ["-p", String(state.pid), "-o", "comm="], {
          encoding: "utf8",
        }).trim();
      } catch {
        exe = ""; // no such process — nothing to sweep
      }
      // Validate identity by EXACT executable equality before killing
      // (FIX 3): `ps -o comm=` reports the process's own executable path,
      // so a process whose *arguments* merely mention our binary's path
      // (`tail -f <path>`, `otool -l <path>`, an editor with the file
      // open) can never match. Substring matching the full command line
      // was the same false-positive class plan D2 rejected for `pkill -f`.
      if (exe && exe === state.executablePath) {
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

/** One spawned whisper-server process. Generation tracking (FIX 1 rule 1):
 * every piece of per-process state — port, intentionalStop, exit handling —
 * lives on this object, bound to one spawn, so an old child's async exit
 * event can never clear a newer child's handle/port or leak its flags. */
interface ActiveChild {
  gen: number;
  proc: ChildProcess;
  port: number;
  /** Set right before a deliberate kill (stop()/restart()/adoption give-up)
   * so handleExit never treats the resulting exit as an unexpected crash. */
  intentionalStop: boolean;
  /** True once this child answered a readiness probe (or was late-adopted). */
  ready: boolean;
  exited: boolean;
}

export class WhisperServer {
  private status: WhisperServerStatus = "stopped";
  private currentChild: ActiveChild | null = null;
  /** Child in its lateReady adoption window (missed the normal readiness
   * poll but still alive — see LATE_READY_GRACE_MS). */
  private lateChild: ActiveChild | null = null;
  private generation = 0;
  private crashTimestamps: number[] = [];
  private circuitBreakerTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stableClearTimer: ReturnType<typeof setTimeout> | null = null;
  private readyWaiters: ReadyWaiter[] = [];
  private startPromise: Promise<void> | null = null;
  /** Terminal quit flag (FIX 4): set first thing in stop(), never reset.
   * Once true, no code path may ever spawn a new child. */
  private shuttingDown = false;

  get baseUrl(): string | null {
    const child = this.currentChild;
    return child && !child.exited ? `http://127.0.0.1:${child.port}` : null;
  }

  getStatus(): { status: WhisperServerStatus; port: number | null } {
    return { status: this.status, port: this.currentChild?.port ?? null };
  }

  /** Safe to call multiple times — concurrent callers share the in-flight attempt. */
  async start(): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("Whisper server is shutting down");
    }
    if (this.status === "ready" && this.currentChild && !this.currentChild.exited) {
      return;
    }
    if (this.startPromise) return this.startPromise;

    // A deliberate start supersedes any scheduled auto-restart.
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

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

    // A fresh spawn supersedes any child still in its lateReady adoption
    // window — never keep two children alive.
    this.abandonLateChild();

    for (let attempt = 1; attempt <= SPAWN_ATTEMPTS_MAX; attempt += 1) {
      // FIX 4: pre-spawn abort — stop() may have flipped the flag while we
      // were in an earlier await of this loop.
      if (this.shuttingDown) return this.abortForShutdown(null, paths);

      let port: number;
      try {
        port = await pickFreePort();
      } catch (portErr) {
        // Even "no free port after 5 probes" must land on a terminal state
        // (FIX 1 rule 2) — never stranded on "starting".
        const err =
          portErr instanceof Error ? portErr : new Error(String(portErr));
        this.status = "crashed";
        this.failReadyWaiters(err);
        this.recordCrashAndScheduleRestart();
        throw err;
      }
      if (this.shuttingDown) return this.abortForShutdown(null, paths);

      const child = this.spawnChild(paths, port);

      // FIX 4: post-spawn abort — the flag may have flipped during spawn;
      // the freshly spawned child must not outlive the quit.
      if (this.shuttingDown) return this.abortForShutdown(child, paths);

      const outcome = await this.pollChildReady(
        child,
        Date.now() + SPAWN_READY_TIMEOUT_MS,
      );
      if (this.shuttingDown) return this.abortForShutdown(child, paths);

      if (outcome === "ready") {
        this.markReady(child);
        return;
      }

      if (outcome === "exited") {
        // Child died before ever becoming ready — bind-failure class (the
        // probed port was likely stolen between probe-close and spawn, plan
        // D2): retry immediately on a fresh port. Deliberately NOT pushed
        // into crashTimestamps (FIX 5 rule 1 — port collision != crash).
        console.warn(
          `[Whisper] child gen=${child.gen} exited before ready (attempt ${attempt}/${SPAWN_ATTEMPTS_MAX}) — retrying on a new port`,
        );
        clearState(paths);
        continue;
      }

      // outcome === "timeout" with the child still ALIVE: most likely a cold
      // Metal shader compile (~7.5s measured), not a hang. Killing it would
      // restart the compile from scratch — a kill loop that never converges
      // (FIX 1 rule 6). Fail this attempt for the caller (waiters rejected,
      // status "crashed"), but leave the child running under a background
      // adoption poll. The adoption watchdog owns the follow-up transition:
      // ready within LATE_READY_GRACE_MS -> adopt ("ready"); otherwise
      // kill + crash accounting + scheduled restart.
      const err = new Error("Whisper server did not become ready in time");
      this.status = "crashed";
      this.failReadyWaiters(err);
      this.beginLateReadyAdoption(child);
      throw err;
    }

    // All spawn attempts burned without a child ever becoming ready — only
    // NOW is this a crash-class failure (FIX 1 rule 2 terminal transition:
    // never left stranded on "starting").
    const err = new Error(
      `Whisper server exited before becoming ready (${SPAWN_ATTEMPTS_MAX} ports tried)`,
    );
    this.status = "crashed";
    this.failReadyWaiters(err);
    this.recordCrashAndScheduleRestart();
    throw err;
  }

  /** FIX 4: transactional shutdown abort for an in-flight doStart — kills
   * this attempt's child (if any), clears the state file, and lands on the
   * "stopped" terminal state. */
  private abortForShutdown(
    child: ActiveChild | null,
    paths: WhisperAssetPaths,
  ): never {
    if (child) {
      this.killChild(child);
      if (this.currentChild === child) this.currentChild = null;
    }
    clearState(paths);
    this.status = "stopped";
    throw new Error("Whisper server is shutting down");
  }

  private spawnChild(paths: WhisperAssetPaths, port: number): ActiveChild {
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

    const proc = spawn(paths.serverBin, args, {
      cwd: paths.binDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const child: ActiveChild = {
      gen: ++this.generation,
      proc,
      port,
      intentionalStop: false,
      ready: false,
      exited: false,
    };
    this.currentChild = child;

    if (proc.pid) {
      persistState(paths, proc.pid);
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      console.log(`[Whisper] ${chunk.toString().trim()}`);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      console.log(`[Whisper] ${chunk.toString().trim()}`);
    });
    // Exit handling is bound to THIS child (generation tracking, FIX 1):
    // a stale child's late exit can only log — never mutate newer state.
    proc.on("exit", (code, signal) => this.handleExit(child, code, signal));
    proc.on("error", (err) => {
      console.error(`[Whisper] spawn error (gen=${child.gen}):`, err);
      // A failed spawn may never emit "exit" — mark the child dead so this
      // attempt's readiness poll fails immediately instead of timing out.
      this.handleExit(child, null, null);
    });

    return child;
  }

  /**
   * Phase-0 preflight (docs/whisper-preflight-phase0.md §2) empirically
   * proved this binary loads the model synchronously in main() before
   * calling listen() — there is no window where the port is open but the
   * model isn't ready. So "first successful HTTP response" IS the readiness
   * signal; no stdout-marker parsing needed.
   *
   * Child-bound (FIX 5 rule 2): the poll fails the moment OUR child exits,
   * and an HTTP answer on the port only counts as "ready" while our child
   * is alive — a foreign process that stole the port after our child's
   * bind-failure exit can never be mistaken for our server.
   */
  private async pollChildReady(
    child: ActiveChild,
    deadlineTs: number,
  ): Promise<"ready" | "exited" | "timeout"> {
    const baseUrl = `http://127.0.0.1:${child.port}`;
    while (Date.now() < deadlineTs) {
      if (child.exited) return "exited";
      if (this.shuttingDown) return "timeout"; // callers re-check the flag
      const remaining = Math.max(50, deadlineTs - Date.now());
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(300, remaining),
      );
      try {
        await fetch(baseUrl + "/", { signal: controller.signal });
        // Any response (even non-2xx) proves a server is up — but it is
        // only OURS if our child is still alive right now.
        return child.exited ? "exited" : "ready";
      } catch {
        // not up yet — keep polling
      } finally {
        clearTimeout(timer);
      }
      await sleep(50);
    }
    return child.exited ? "exited" : "timeout";
  }

  private markReady(child: ActiveChild): void {
    child.ready = true;
    this.status = "ready";
    // Crash streak is NOT cleared here (FIX 1 rule 5) — only after a
    // proven-stable interval, so a ready-then-instant-crash loop still
    // accumulates toward the breaker.
    this.scheduleStableClear();
    this.resolveReadyWaiters();
  }

  private scheduleStableClear(): void {
    if (this.stableClearTimer) clearTimeout(this.stableClearTimer);
    this.stableClearTimer = setTimeout(() => {
      this.stableClearTimer = null;
      if (this.status === "ready") {
        this.crashTimestamps = [];
      }
    }, PROVEN_STABLE_MS);
  }

  /** FIX 1 rule 6 — "lateReady adoption": keep polling a slow-loading child
   * (cold Metal shader compile) in the background. Adopt it if it becomes
   * ready inside the grace window; otherwise kill it, count ONE crash for
   * the whole slow-start episode, and let backoff/breaker schedule the
   * retry. */
  private beginLateReadyAdoption(child: ActiveChild): void {
    this.lateChild = child;
    console.warn(
      `[Whisper] child gen=${child.gen} missed the ${SPAWN_READY_TIMEOUT_MS}ms readiness window but is still alive — polling up to ${LATE_READY_GRACE_MS}ms more before killing (lateReady adoption; likely cold Metal shader compile)`,
    );
    void (async () => {
      const outcome = await this.pollChildReady(
        child,
        Date.now() + LATE_READY_GRACE_MS,
      );
      if (this.lateChild !== child) return; // superseded by a newer attempt/stop
      this.lateChild = null;

      if (this.shuttingDown) {
        this.killChild(child);
        return;
      }

      if (outcome === "ready" && this.currentChild === child && !child.exited) {
        console.log(
          `[Whisper] lateReady adoption succeeded (gen=${child.gen}) — server ready`,
        );
        this.markReady(child);
        return;
      }

      console.error(
        `[Whisper] lateReady adoption failed (gen=${child.gen}, outcome=${outcome}) — killing and scheduling restart`,
      );
      this.killChild(child);
      if (this.currentChild === child) this.currentChild = null;
      this.status = "crashed";
      this.recordCrashAndScheduleRestart();
    })();
  }

  /** Abandon (and kill) a child waiting in its adoption window — called
   * whenever a fresh spawn or a deliberate restart/stop supersedes it. */
  private abandonLateChild(): void {
    const late = this.lateChild;
    if (!late) return;
    this.lateChild = null; // the adoption watchdog sees this and bails out
    this.killChild(late);
    if (this.currentChild === late) this.currentChild = null;
  }

  private killChild(child: ActiveChild): void {
    child.intentionalStop = true;
    if (!child.exited) {
      try {
        child.proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * Waits for the server to be usable. If already ready, resolves instantly.
   * If circuit-broken (unavailable), bypasses the 30s cooldown and forces
   * one clean attempt (plan D3: "a dictation's ensureReady may force one
   * clean attempt"). If stopped, starts it. Otherwise it only registers a
   * bounded waiter when something in flight will actually settle it —
   * stranded-state-proof (FIX 1 rule 3): a wait that nothing would ever
   * resolve is never registered; a fresh start() is kicked instead.
   */
  async ensureReady(timeoutMs: number): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("Whisper server is shutting down");
    }
    if (this.status === "ready" && this.currentChild && !this.currentChild.exited) {
      return;
    }

    if (this.status === "unavailable" || this.status === "stopped") {
      if (this.circuitBreakerTimer) {
        clearTimeout(this.circuitBreakerTimer);
        this.circuitBreakerTimer = null;
      }
      await this.start();
      return;
    }

    // starting/restarting/crashed: something must be in flight to settle a
    // waiter — an in-flight attempt, a scheduled auto-restart, or a
    // lateReady adoption watchdog. If none is, the state is stranded (should
    // be impossible after FIX 1, but generalized defensively): force a
    // fresh clean attempt instead of waiting forever.
    const somethingWillSettleUs =
      this.startPromise !== null ||
      this.restartTimer !== null ||
      this.lateChild !== null;
    if (!somethingWillSettleUs) {
      await this.start();
      return;
    }

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

  /** Deliberate restart (failed request retry, or explicit recovery).
   * Always an immediate SIGKILL — no grace period. Serialized (FIX 1 rule
   * 4): any in-flight start attempt is settled first (its promise awaited),
   * the current child is killed and its exit consumed BEFORE the new spawn,
   * and intentionalStop is per-child — so a stale exit can neither be
   * misread as a fresh crash nor leak into the next child. The crash streak
   * is NOT reset here (FIX 1 rule 5 — only a proven-stable ready interval
   * clears it). */
  async restart(reason: string): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("Whisper server is shutting down");
    }
    console.warn(`[Whisper] restart requested: ${reason}`);
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.stableClearTimer) {
      clearTimeout(this.stableClearTimer);
      this.stableClearTimer = null;
    }

    // Settle any in-flight attempt first — never share its startPromise.
    if (this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        /* the settled attempt failed — that's what we're recovering from */
      }
    }
    if (this.shuttingDown) {
      throw new Error("Whisper server is shutting down");
    }
    // The settled attempt may have scheduled a follow-up restart — cancel
    // it; this deliberate restart supersedes it.
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.abandonLateChild();

    const child = this.currentChild;
    if (child && !child.exited) {
      child.intentionalStop = true;
      const exited = new Promise<void>((resolve) => {
        if (child.exited) {
          resolve();
          return;
        }
        child.proc.once("exit", () => resolve());
      });
      try {
        child.proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      await exited; // consume this child's exit before spawning the next
    }
    if (this.currentChild === child) this.currentChild = null;
    this.status = "stopped";
    await this.start();
  }

  private handleExit(
    child: ActiveChild,
    code: number | null,
    signal: string | null,
  ): void {
    if (child.exited) return; // "error" + "exit" can both fire for one child
    child.exited = true;

    if (this.currentChild !== child) {
      // Stale generation (FIX 1 rule 1): a superseded child's exit is
      // informational only — it must never clear the live child's
      // handle/port or schedule anything.
      console.log(
        `[Whisper] stale child gen=${child.gen} exited (code=${code} signal=${signal}) — ignored`,
      );
      return;
    }

    this.currentChild = null;

    if (child.intentionalStop || this.shuttingDown) {
      // stop()/restart()/adoption-give-up own the resulting transition.
      return;
    }

    if (!child.ready) {
      // Exit during startup: doStart's attempt loop (or the lateReady
      // adoption watchdog) observes `exited` and owns the next transition —
      // scheduling a restart here too would double-drive the machinery.
      console.warn(
        `[Whisper] child gen=${child.gen} exited before ready (code=${code} signal=${signal})`,
      );
      return;
    }

    console.error(
      `[Whisper] server exited unexpectedly (gen=${child.gen} code=${code} signal=${signal})`,
    );
    if (this.stableClearTimer) {
      clearTimeout(this.stableClearTimer);
      this.stableClearTimer = null;
    }
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

    // 5th crash in the rolling window trips the breaker (amended D3
    // contract — ">=", not ">").
    if (this.crashTimestamps.length >= CIRCUIT_BREAKER_MAX_CRASHES) {
      console.error(
        `[Whisper] circuit breaker tripped (${this.crashTimestamps.length} crashes/${CRASH_WINDOW_MS}ms) — unavailable, retrying every ${CIRCUIT_BREAKER_RETRY_MS}ms`,
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
      this.start().catch((err) => {
        console.error("[Whisper] auto-restart failed:", err);
      });
    }, delay);
  }

  private scheduleCircuitBreakerRetry(): void {
    if (this.circuitBreakerTimer) clearTimeout(this.circuitBreakerTimer);
    this.circuitBreakerTimer = setTimeout(() => {
      this.circuitBreakerTimer = null;
      if (this.status !== "unavailable" || this.shuttingDown) return;
      this.start().catch((err) => {
        console.error("[Whisper] circuit-breaker retry failed:", err);
        // Re-arm the next 30s retry (FIX 1 rule 5: the retry loop must not
        // die after a single failed attempt). A crash-class failure also
        // re-arms via recordCrashAndScheduleRestart — safe, because this
        // method clears any existing timer before setting a new one.
        if (!this.shuttingDown && this.status === "unavailable") {
          this.scheduleCircuitBreakerRetry();
        }
      });
    }, CIRCUIT_BREAKER_RETRY_MS);
  }

  /** App-quit ONLY: SIGTERM -> 2s grace -> SIGKILL. Sets the terminal
   * `shuttingDown` flag FIRST and unconditionally (FIX 4) — from that
   * point start()/restart()/ensureReady() reject immediately and any
   * in-flight doStart aborts (killing its own child), so no new server can
   * ever be spawned after quit begins. Clears the sidecar state file since
   * a clean stop leaves no orphan to sweep next launch. */
  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.stableClearTimer) {
      clearTimeout(this.stableClearTimer);
      this.stableClearTimer = null;
    }
    this.failReadyWaiters(new Error("Whisper server stopped"));

    // Settle any in-flight start attempt: with shuttingDown set, its own
    // pre/post-spawn checks abort it quickly (killing its child if one was
    // spawned) — so this never early-returns while a doStart is still in
    // its pre-spawn awaits (FIX 4 rule 2).
    if (this.startPromise) {
      try {
        await this.startPromise;
      } catch {
        /* expected — the attempt aborted for shutdown */
      }
    }
    this.abandonLateChild();

    const child = this.currentChild;
    if (!child || child.exited) {
      this.currentChild = null;
      this.status = "stopped";
      clearState(getAssetPaths());
      return;
    }

    child.intentionalStop = true;
    this.status = "stopping";

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      if (child.exited) {
        done();
        return;
      }
      child.proc.once("exit", done);
      try {
        child.proc.kill("SIGTERM");
      } catch {
        done();
        return;
      }
      setTimeout(() => {
        if (!settled && !child.exited) {
          try {
            child.proc.kill("SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }, QUIT_GRACE_MS);
    });

    this.currentChild = null;
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
