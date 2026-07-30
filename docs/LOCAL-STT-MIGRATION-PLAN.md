# StayFree: Sarvam → Local whisper.cpp Migration — Implementation Plan

> Fusion-synthesized (Claude + Codex legs, both independently converged on the core architecture).
> v1 scope: full-buffer record→stop→transcribe via stock `whisper-server`. Streaming, packaging, model download = later phases.

## 1. High-level design

```
Renderer (UNCHANGED)                          Main process
─────────────────────                         ────────────────────────────────
AudioWorklet PCM16@16kHz ──audio-chunk-stream──▶ RecordingSession.pcmChunks (full buffer)
MediaRecorder WebM ────────audio-captured──────▶ pipeline (audio-captured handler)
                                                    │ concat + WAV-wrap
                                                    ▼
                                              transcriber.ts ──POST /inference──▶ whisper-server
                                                    │  (retry: restart once)      (child process,
                                                    ▼                              Metal, warm model)
                                              history + paste (UNCHANGED)
```

Three new main-process modules, one deleted:

| Module | Responsibility |
|---|---|
| `src/main/whisper/server.ts` [new] | `WhisperServer` — asset paths (single seam), zombie sweep, dynamic port, spawn, readiness, crash auto-restart (backoff + circuit breaker), shutdown |
| `src/main/whisper/transcriber.ts` [new] | `transcribePcm(pcm16): Promise<string>` — WAV build via wav.ts, multipart `fetch` (built-in, zero new deps), timeout/abort, retry policy, PipelineError mapping |
| `src/main/whisper/wav.ts` [new] | Pure PCM16→WAV builder (moved from Sarvam file) — pure & unit-testable |
| `src/main/transcription-sarvam-stream.ts` [delete] | Entire Sarvam WS transcriber (633 lines of keepalive/reconnect/replay machinery — none of it applies to a warm local server) |

No formal `Transcriber` interface with one implementation (YAGNI): the pipeline calls one function at one seam; phase-2 streaming swaps the module behind the same call site. Documented with a one-line comment at the call seam.
*(Dissent preserved: Codex leg proposed a formal interface + separate types.ts/runtime.ts — rejected as ceremony for a single impl; the 3-file split keeps the same testability.)*

## 2. Resolved decisions

**D1 — Error surfacing: widget error state.** Add `"error"` to `WidgetUiState`. On final ASR failure, main sends a user-safe message; widget shows a distinct error pill ~3s, auto-reverts to idle; starting a new recording clears it instantly. Logs keep code+cause; widget gets only user-safe text. No new window, no macOS notifications. (Both legs converged; evidence: errors today are intentionally swallowed, src/index.ts:1441/1504; widget is the only always-visible surface.)
**IPC contract (today's channel is a bare string union — src/preload.ts:127-137):** the `widget-state` payload becomes one typed object `{ state, message?, pipelineId }` across main + preload + widget. The widget shows `message` only for `state:"error"`, and a stale pipeline's error can never overwrite a newer recording's state (`pipelineId` check — mirrors the existing `activePipelineId` guard). **The 20s pipeline-deadline abort ALSO emits this error state** — today it force-resets to idle silently (src/index.ts:523-546), which would violate the "failures must be visible" lock.

**D2 — Port & zombies: dynamic ephemeral port + owned-PID validated sweep.**
- Port: pick a random free port in 49152–65535 (probe with a momentary Node listener, release, spawn `--host 127.0.0.1 --port N`); on bind-failure exit, pick another (max ~5 tries). Kills the entire port-collision class (incl. stale servers and manual benchmark runs).
- Zombie sweep at startup: persist the spawned child's `{ pid, executablePath }` in `userData/whisper/sidecar-state.json`; on next launch, kill that PID **only after validating** (`ps -p PID -o command=`) that it is still our exact whisper-server binary — then delete the state file. Reaps orphans left by a crashed/SIGKILLed app (~300MB RAM each) with zero false-positive risk. A broad `pkill -f <path>` was rejected: it matches command-line *text*, so an innocent process whose args merely contain the path (an `otool`/`tail`/editor invocation during debugging) could be killed.
*(Synthesis: dynamic port = both legs' direction; validated PID-state sweep = Codex leg, adopted after the advisor's concrete false-positive evidence overturned the simpler pkill variant.)*

**D3 — Lifecycle.** States: `stopped → starting → ready → crashed (→ restarting) → stopping`. API: `start()`, `ensureReady(timeoutMs)`, `restart(reason)`, `stop()`, `getStatus()`.
- Start async right after `app.whenReady` — never blocks onboarding/hotkey/recorder setup.
- **Readiness signal is established in the blocking preflight (see §4), not assumed** — TCP-open alone is unproven as "model loaded" for v1.9.1. Whatever the preflight proves (HTTP probe answering = ready, or a stdout marker) becomes the implementation.
- Crash restart: backoff 0/0.5/1/2/4s; the **5th crash in a rolling 60s window trips the circuit-breaker** to `unavailable` (contract unified 2026-07-30 — conservative, brakes early), retry every 30s (looping — every failed retry re-arms the next); a dictation's `ensureReady` may force one clean attempt. Intentional stop/restart suppresses auto-restart. The crash streak is cleared only after a proven-stable interval (ready + 60s without a crash), never on mere readiness.
- Spawn: `cwd` = asset dir, `--tmp-dir <userData>/whisper/tmp` (owned, cleared at startup), `stdio: pipe` with stderr → console prefixed `[Whisper]`, exec-bit chmod (space-watcher precedent, src/index.ts:316).
- `before-quit`: SIGTERM → 2s grace → SIGKILL (replaces Sarvam shutdown at src/index.ts:1555).

**D4 — Transcriber & session cleanup.**
- `transcribePcm(pcm16: Buffer): Promise<string>` — throws `PipelineError`. Flow: `ensureReady` → WAV → `fetch` multipart (`file`, `response_format=json`) with AbortController → `json.text.trim()` (server appends `\n`).
- Retry policy: **empty PCM → `NO_AUDIO` immediately (no HTTP). Empty transcript text → `NO_TRANSCRIPT`, surfaced, NO restart-retry (restarting the engine cannot un-silence silence — Codex catch).** Any engine failure (unreachable / non-2xx / malformed / timeout) → abort, `restart()`, retry same WAV once → second failure surfaces.
- Error codes recast (internal-only today, grep-verified): `NO_AUDIO`, `NO_TRANSCRIPT`, `ENGINE_UNAVAILABLE`, `ASR_TIMEOUT`, `ASR_FAILED`. `mapPipelineError` (src/index.ts:553) shrinks; messages stay user-readable (D1 displays them).
- Session: `pcmChunks` becomes the primary payload. **`needsReplay` + live-forward + replay logic DIES** (src/index.ts:85, 514-521, 620-642, 1332-1335 — existed only to heal a broken cloud stream). `audio-chunk-stream` handler = accumulate only. Energy stats stay (diagnostics; possible future silence gate).

**D5 — Timeouts (end-to-end budget, not just request math). [REWRITTEN 2026-07-30 — post-review amendment]** `READY_TIMEOUT_MS = 4000`, `ASR_REQUEST_TIMEOUT_MS = 4500`, `PROCESSING_TIMEOUT_MS = 12000` (was 20000; the original "13s worst + ~7s margin" arithmetic was also wrong — the true sequential worst chain was ~17s: ready 4 + request 4.5 + restart-ready 4 + request 4.5). The deadline arms at key RELEASE, and the engine is local (measured warm ASR 0.15-1.2s; warm request 0.106s, cold-after-spawn 0.558s). The worst *legitimate* chain the deadline must cover is the hung-server self-heal: attempt 1 (ready-wait + request timeout ≈ 8.5s) + **failed-process kill = immediate SIGKILL, zero grace** (the 2s SIGTERM grace applies ONLY to app-quit shutdown) + respawn-to-ready (~1s) + attempt 2 (~1s) ≈ **10.5-11s, fits under 12s**. (10s was considered and rejected — it cut the self-heal window.) Once the deadline fires, `transcribePcm`'s `shouldContinue` cancellation callback blocks any further stale retry/restart — a superseded dictation can never SIGKILL/respawn the server a newer recording is about to use; the in-flight HTTP request self-settles via its own AbortController and its result is discarded by the `activePipelineId` guard. Deadline expiry itself surfaces the D1 error instead of a silent reset.

**D6 — Naming.** Rename all main-process-only "Hindi" concepts now (same-diff, near-zero marginal churn; misleading names fail the contributor bar): `HindiRecordingSession→RecordingSession`, `activeHindiSession→activeRecordingSession`, `start/stop/clearHindiSession→…RecordingSession`, `transcribeHindiWithRetries→` (replaced by transcriber call), `HINDI_STREAM_*` constants die. **Do NOT touch renderer wire names** (`hindiMode` arg, `audio-chunk-stream`, recorder.ts internals) — locked unchanged; one comment at the main-side send site records the deferred rename; also noted in docs.

**D7 — Decode flags: exactly the accuracy-validated set.** `-l hi -nt -bs 1 -bo 1 -t 4` + `--host 127.0.0.1 --port <dynamic>` + `-m <model>` + `--tmp-dir <owned>`. NO `--convert` (no ffmpeg dep), NO `--prompt` (Test 2 regressions), NO `-sns` unless the preflight silence matrix proves it removes hallucination without suppressing valid short speech, NO thread change (validated + heat envelope).

**D8 — Store/settings/credential hygiene.**
- Remove `sarvamApiKey` from `StoreSchema` + defaults (src/main/store.ts:17,32) + `get-settings` (src/index.ts:1032) + IPC pair (src/index.ts:1070-1077) + preload methods/types (src/preload.ts:91-96,195-202).
- One idempotent startup `store.delete("sarvamApiKey")` — schema removal alone leaves the user's credential in the on-disk JSON forever.
- `dotenv` import (src/index.ts:38) + `.env.example` [delete] + deps `ws`, `@types/ws`, `dotenv` removed from package.json; `package-lock.json` regenerates (transitive `ws` entries may remain — fine). Webpack: `ws` external + CopyWebpackPlugin block removed (webpack.main.config.ts:23-33,43-44); `uiohook-napi` untouched.
- Onboarding copy (src/renderer/onboarding.tsx:159) → "Audio is transcribed locally on your Mac — it never leaves your device." (Verified: onboarding gates only mic+accessibility, src/index.ts:885-915 — no key gating.)
- Settings UI: verified no Sarvam section exists — nothing to remove there.

**D9 — Additional required items (verified this session).**
1. **rpath is a CONFIRMED blocker, not a premise:** `otool -l` shows `LC_RPATH = /Users/mac/stt-testing/whisper.cpp/build/bin` (absolute). A naive copy silently loads dylibs from the source tree — works on this machine, breaks anywhere else. Fix in setup script: `install_name_tool -rpath "<abs>" "@loader_path" whisper-server` after copy; verify with `otool -l` + a run with the source dir temporarily renamed.
2. `src/renderer/recorder.worklet.ts` [delete] — grep-verified unreferenced (worklet code is inlined in recorder.ts); it's dead code with stale Sarvam comments.
3. `README.md` [modify] — currently claims Windows support, Sarvam, WebSocket streaming, API key (lines 5-46). Rewrite: macOS-only, local-first, no key, asset bootstrap.
4. `CLAUDE.md` [modify] — architecture/pipeline/Sarvam-notes sections rewritten (contributors and AI sessions read this first). *(Claude-leg catch; Codex missed.)*
5. Dev bootstrap: `scripts/setup-whisper.sh` [new] — copies binary+dylibs+model from `~/stt-testing`, chmod, rpath-patch, completeness check (file sizes — guard against half-copied 82MB model), one curl smoke. Explicit script chosen over in-app auto-seeding (machine-specific magic inside app code fails the contributor bar); the app itself only *checks* assets exist and reports cleanly.
6. Missing/broken assets at runtime → `start()` fails clean → state `unavailable` → first dictation shows D1 error ("Transcription engine not installed — run scripts/setup-whisper.sh"). No launch-time dialog spam.
7. Failed-dictation audio: WebM is saved BEFORE ASR (src/index.ts:1419) and retained on failure — keep (future training data). Known pre-existing quirk, unchanged: failure-path files aren't in history (orphaned on disk). Deferred product decision, noted in docs.
8. `docs/LOCAL-FIRST-STT.md` — update §9 checklist + record deferred renderer-rename after implementation.

## 3. Implementation sequence

**Phase 0 — BLOCKING preflight (no app code before this passes):**
1. Copy binary+dylibs+model to a disposable dir; patch rpath; `otool -L/-l` verify; **rename `~/stt-testing/whisper.cpp` temporarily and confirm the copied server still starts + Metal (`MTL0`) in log** — this is the only honest proof the copy is self-contained.
2. Establish the true readiness signal (when does it accept connections vs when is the model loaded).
3. Degenerate-input matrix: empty WAV, 1-sample, ~300ms, pure-silence 3s (with/without `-sns`), concurrent 2nd POST, kill-during-request, tmp-dir before/after.
4. Long-clip latencies: 30s / 60s / 120s (validates D5 numbers; only a *measured* problem may introduce a cap).
Results recorded in the plan's verification log; unverified assumptions may not survive into code.

**Phase 1 — Modules standalone:** `wav.ts`, `server.ts`, `transcriber.ts` + scratch harness: transcribe 3 known gold-set WAVs → outputs must EQUAL Test 4's stored results (`~/stt-testing/results/`) — proves flag parity, not just "it ran".

**Phase 2 — Pipeline rewire (`src/index.ts`):** warm-up swap (`warmSarvamConnection`→`whisperServer.start()`), `beginRecording` simplification, chunk-handler accumulate-only, ASR call swap, uncaughtException + deadline-abort swap to local abort, before-quit swap, D6 renames, Sarvam IPC removal.

**Phase 3 — UI + hygiene:** widget error state (union member, preload type, App.tsx + css), onboarding copy, store scrub, deps/webpack/env cleanup, worklet delete.

**Phase 4 — Docs + verification:** README, CLAUDE.md, LOCAL-FIRST-STT.md; full protocol below.

**~~Optional: minimal test infra~~ — STRUCK by owner (2026-07-30).** v1 ships without test infra; verification relies on the manual protocol (§5) + gold-set parity checks. Tests may be added in a later phase.

## 4. Risks & edge cases

| Risk | Mitigation |
|---|---|
| rpath copy resolves to source tree (CONFIRMED absolute LC_RPATH) | Phase-0 patch + renamed-source-dir proof; setup script owns the fix |
| Silence → Whisper hallucinates filler | Phase-0 silence matrix is DECISIVE: adopt `-sns` only if it removes hallucination AND passes the short-clip regression (gold-set <3s clips unchanged). NO pre-ASR `hasSpeech` gate — the code itself documents that the energy baseline misclassifies immediate push-to-talk speech as silence (src/index.ts:607-613); adding that gate would eat real first-words. If `-sns` fails AND hallucination is confirmed real → surface to the owner as a ship/no-ship decision, never silently accept. Paste never fires on `NO_TRANSCRIPT` |
| First dictation races model load | `ensureReady(4s)` inside transcribe; widget shows normal processing; ~1-2s once per launch worst case |
| Crash loop (bad model/binary) | Backoff + circuit breaker (5th crash in a rolling 60s window trips → 30s retry cadence — same contract as D3); no hot respawn; heat-safe |
| Orphan server after app SIGKILL | Startup owned-PID validated sweep — exact executable match (`ps -o comm=` equality against the recorded binary path; D2 rejected pkill/substring matching); dynamic port means it never blocks us either way |
| 12s failsafe kills a legitimate retry | Amended budget (hung-server self-heal ≈ 11s < 12s — see D5); stale post-deadline retries/restarts blocked by transcribePcm's cancellation callback; exercised by kill-mid-recording smoke test |
| Concurrent requests to server (behavior unknown) | Unreachable by construction: `isProcessing` guard (src/index.ts:1363) + single call site; comment at export warns future contributors |
| Long recordings (buffer RAM + latency) | Preflight measures 30/60/120s; cap only if measured necessary |
| Deleted Sarvam file hides shared util | `wrapPcm16InWav` → wav.ts move-then-delete; grep confirms no other consumers |
| Cleanup deletes user data | Runtime cleanup touches ONLY `userData/whisper/tmp` + our child processes; never `recordings/` |

## 5. Verification protocol

1. **Build:** `npm run package` clean (the repo's only working type-check) + `npm run lint`.
2. **Repo hygiene [AMENDED 2026-07-30]:** the real check is **no RUNTIME Sarvam integration** — no imports, no endpoints, no env/credential access, no deps. `rg -i 'sarvam|SARVAM_API_KEY' src package.json webpack.main.config.ts README.md` is the tool, with these exemptions (which D8 itself mandates and which made the original "zero hits" self-contradictory): (i) the D8-mandated `purgeLegacySarvamApiKey` in `src/main/store.ts` + its `src/index.ts` call site — deleting the legacy key requires naming it; (ii) historical-context comments (module headers in `src/main/whisper/server.ts` / `wav.ts` / `transcriber.ts`, and D6's deferred-rename comments). docs/LOCAL-FIRST-STT.md historical mentions exempt as before.
3. **Accuracy parity:** 3-5 gold-set clips through the real app path == Test 4 stored transcripts. (Full 82-clip re-run optional; WER-vs-Sarvam framing stays "disagreement", not absolute accuracy.)
4. **Smoke (npm start):** short Hinglish → paste + L_asr log (<1s expected) · 60s+ dictation → complete paste · English jargon (known weakness, not a gate) · silent 3s hold → NO_TRANSCRIPT error pill, NO hallucinated paste · <300ms tap → instant idle, zero ASR call · 5 rapid dictations → no state leak · `kill -9` server mid-recording → release → auto-restart+retry → transcript or clean error, then idle · `kill -9` app → relaunch → sweep reaps orphan (pgrep before/after) · normal quit → `pgrep whisper-server` empty · assets renamed away → dictate → actionable error pill; restore → recovers next dictation.
5. **Offline test:** network fully off → app + dictation work end-to-end (the whole point of local-first).
6. **Widget error UX:** forced failure shows pill, auto-revert, new recording clears.
7. **Perf/heat (M3 8GB):** release→paste p50/p95 logged; server RSS noted idle+active; 10-dictation sustained run without thermal complaint; Metal confirmed in server log.
8. **Docs:** README/CLAUDE.md truthful; setup script runs clean on a fresh shell.

## 6. Explicitly deferred (recorded, not forgotten)

- Renderer/IPC rename (`hindiMode`, `audio-chunk-stream`) → phase 2 (streaming touches renderer anyway)
- Streaming sidecar, packaged distribution (extraResources + rpath/signing interplay noted), model download-on-first-run, idle-unload, VAD, Windows
- Failed-dictation history entries (product decision)
- `install_name_tool` vs future code-signing: packaged assets must be re-patched before signing/notarization (noted for the packaging phase)

## 7. Post-review amendments (2026-07-30)

A dual independent review (Claude Fable + Codex) of the implementation was run against this
plan — raw reports: `docs/reviews/claude-review-findings.md`,
`docs/reviews/codex-review-findings.md`. The approved fix plan is
`docs/reviews/FIX-PLAN-2026-07-30.md` (FIX 1, 3-12 approved and implemented; FIX 2
deferred). The following implementation deviations are now **canon**:

- **12s processing deadline** — `PROCESSING_TIMEOUT_MS = 12000` (was 20000); D5 above
  rewritten with the corrected arithmetic and rationale.
- **Exact-match zombie sweep** — orphan-PID identity is validated by *equality* of
  `ps -p PID -o comm=` (the process's own executable path) against the recorded binary
  path, not by command-line substring.
- **Bounded bind-failure port retry** — inside one start attempt, a child that exits
  before ever becoming ready triggers a fresh-port respawn (max 5 ports); these retries
  are **not** crash-accounted (port collision ≠ crash).
- **lateReady adoption window** — a child that misses the 4s readiness poll but is still
  alive (cold Metal shader compile, ~7.5s measured) is *not* killed: a background poll
  gives it up to 15s to converge and adopts it as `ready`; only then is it killed and
  crash-accounted.
- **Terminal `shuttingDown` state** — `stop()` sets a permanent flag first;
  `start()`/`restart()`/`ensureReady()` reject and any in-flight startup aborts (killing
  its own child) — no spawn is possible after quit begins.
- **Crash accounting** — the crash streak is cleared only after 60s of proven-stable
  readiness; the 5th crash in the rolling 60s window trips the breaker; the breaker's 30s
  retry loops (every failed retry re-arms the next).
- **Transcriber cancellation callback** — `transcribePcm(pcm16, shouldContinue?)`: a
  stale (deadline-expired/superseded) pipeline never restarts the engine or starts a
  second attempt. Full AbortController plumbing stays deferred to the streaming phase.
- **Staged atomic setup script** — `scripts/setup-whisper.sh` stages, verifies (per-file
  completeness, real-LC_RPATH-based patch, alive+HTTP smoke on a dynamic free port) and
  only then atomically swaps the install; failures leave an existing install untouched.
- **`CLAUDE.md` untracked by choice** — active development phase; it will be handed to
  other developers when complete. D9.4's rewrite deliverable is local-disk-only.
- **Widget error-message UI = separate future PR** — visible error text, an `error`
  widget layout, and CSS-state cleanup (FIX 2, DEFERRED).
