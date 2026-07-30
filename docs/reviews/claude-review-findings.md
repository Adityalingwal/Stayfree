# Independent Code Review — feat/local-stt (Claude reviewer, 2026-07-30)

Reviewed per `docs/reviews/REVIEW-BRIEF-2026-07-30.md`. Static analysis + git only.
Full files read: `src/main/whisper/server.ts`, `transcriber.ts`, `wav.ts`, the complete
current `src/index.ts`, `scripts/setup-whisper.sh`, `src/preload.ts`,
`src/renderer/widget/App.tsx`, `src/main/store.ts`, `webpack.main.config.ts`,
`src/renderer/widget/widget.css`, plus the untouched `src/renderer/recorder.ts` and
`src/renderer/settings/pages/SettingsPage.tsx` for regression interplay, plus
`git diff main...feat/local-stt` in full.

**Not executed (READ-ONLY constraint):** `npm run package`, `npm run lint`, any runtime
smoke. Items in plan §5.1/§5.3–§5.7 that require running the app are out of scope here;
anything below that depends on timing is explicitly marked "needs runtime verification".

---

## 1. Verdict

**Ship-ready after fixes.** The migration is faithful to the plan on the happy path and
the code is clean and well-commented, but the `WhisperServer` state machine has a family
of failure-path holes (Findings 1, 4) that degrade or mis-handle recovery after a failed
start, and the D1 error message is effectively unreadable in the widget (Finding 2).
None of the findings is a data-loss or crash bug; all failure paths eventually self-heal
or surface *some* error. Fix Findings 1–2 before merge; the rest are polish.

---

## 2. D1–D9 fidelity table

| Decision | Verdict | Evidence |
|---|---|---|
| **D1** widget error state, typed payload, 20s deadline emits error | **Faithful, one deviation** | `"error"` in `WidgetUiState` (src/index.ts:127-132, src/preload.ts:15-20, src/renderer/widget/App.tsx:6-11); typed `{state, message?, pipelineId}` payload (src/index.ts:139-143); deadline path emits error, not silent reset (src/index.ts:533-536); final ASR failure gated on `activePipelineId === pipelineId` (src/index.ts:1384-1386); widget auto-revert 3s + new-recording clears (App.tsx:26, 134-163). **Deviation:** message is tooltip/sr-only, not visible (Finding 2); `pipelineId` staleness check is main-side only, renderer never reads the field (Finding 12). |
| **D2** dynamic port + owned-PID validated sweep | **Faithful with minor deviations** | Port probe 49152–65535, 5 tries (server.ts:32-34, 85-106); state file `{pid, executablePath}` persisted/cleared (server.ts:189-207, 284-286, 509); sweep validates via `ps -p PID -o command=` before SIGKILL (server.ts:136-176). **Deviations:** 65535 unreachable (off-by-one, server.ts:88-90); validation is substring `includes`, not exact-binary (Finding 5); "on bind-failure exit, pick another (max ~5 tries)" is implemented only for *probe* failures — a spawn-time bind failure falls to the generic crash-restart path (Finding 7). |
| **D3** lifecycle states, backoff, circuit breaker, quit grace | **Faithful on happy path; failure-path holes** | States + API (server.ts:18-25, 234, 318, 367, 460); non-blocking start at launch (src/index.ts:1109-1113); backoff 0/0.5/1/2/4s (server.ts:37); >5 crashes/60s → unavailable, 30s retry (server.ts:38-40, 415-456); ensureReady forces clean attempt when unavailable (server.ts:321-328); intentional stop suppresses auto-restart (server.ts:377, 397-405); quit SIGTERM→2s→SIGKILL (server.ts:45, 458-510, src/index.ts:1429-1464); stderr prefixed `[Whisper]` (server.ts:288-293); chmod (server.ts:258-262). **Holes:** failed `doStart` leaves status stuck (Finding 1); quit-during-startup can orphan a child until next launch (Finding 4). |
| **D4** transcriber flow + retry policy + session cleanup | **Faithful** | Empty PCM → `NO_AUDIO` with no HTTP (transcriber.ts:41-47); empty transcript → `NO_TRANSCRIPT`, thrown without retry (transcriber.ts:67-74, 81-83); engine failure → `restart()` → retry same PCM exactly once (transcriber.ts:51, 84-99, MAX_ATTEMPTS=2); error codes recast (transcriber.ts:9-14); `mapPipelineError` shrunk to passthrough+fallback (src/index.ts:557-563); `needsReplay`/live-forward/replay dead — `rg needsReplay|HINDI_STREAM src/` clean; `audio-chunk-stream` handler accumulate-only (src/index.ts:1197-1204); energy stats retained for diagnostics only (src/index.ts:1295-1303). |
| **D5** timeouts | **Deviation (budget interpretation)** | `READY_TIMEOUT_MS=4000`, `ASR_REQUEST_TIMEOUT_MS=4500` (transcriber.ts:30-31), `PROCESSING_TIMEOUT_MS=20000` (src/index.ts:84); deadline arms at release (src/index.ts:1009, 1158) and expiry emits the D1 error. **But** attempt 1 is `ensureReady(4s)` **plus** `fetch(4.5s)` additive — plan says "attempt 1 (≤4.5s incl. its ready-wait)". Worst chain ≈ 4+4.5+4+4.5 = 17s + overhead, not the plan's "13s worst + ~7s margin" (Finding 3). Restart during retry is immediate SIGKILL, zero grace, as specified (server.ts:42-45, 364-382). |
| **D6** naming | **Faithful** | `RecordingSession`/`activeRecordingSession`/`start|stop|clearRecordingSession` (src/index.ts:71-81, 125, 450-464); `transcribeHindiWithRetries` gone; `HINDI_STREAM_*` gone; renderer wire names (`hindiMode`, `audio-chunk-stream`) untouched (preload.ts:38-39, 51-53; recorder.ts:219); comment at the main-side send site records the deferred rename (src/index.ts:505-510); docs note in docs/LOCAL-FIRST-STT.md:189-200. |
| **D7** decode flags | **Faithful** | Exactly `-l hi -nt -bs 1 -bo 1 -t 4` (server.ts:30) + `--host 127.0.0.1 --port <dynamic>` + `-m` + `--tmp-dir` (server.ts:264-275). No `--convert`, no `--prompt`, no `-sns`, no thread change. |
| **D8** store/credential hygiene | **Faithful** | `sarvamApiKey` out of schema/defaults (store.ts:16-42); idempotent startup purge (store.ts:53-57, called src/index.ts:1064); `get-settings` clean (src/index.ts:908-913); preload key methods gone; `dotenv` import gone; `.env.example` deleted; `ws`/`@types/ws`/`dotenv` removed from package.json; webpack `ws` external + copy block removed (webpack.main.config.ts); lockfile `ws` hits are transitive dev-deps only (express-ws, webpack-dev-server) — allowed; onboarding copy updated (onboarding.tsx:159); bonus: CSP `wss://api.sarvam.ai` removed (index.html). |
| **D9.1** rpath patch | **Faithful** | setup-whisper.sh:77-89 — `install_name_tool -rpath "$SRC" "@loader_path"` + `codesign -s - -f` + `otool -l` verification. |
| **D9.2** worklet delete | **Faithful** | `src/renderer/recorder.worklet.ts` deleted (diff −88); no references (`rg recorder.worklet src/` clean). |
| **D9.3** README rewrite | **Faithful** | macOS-only, local-first, no key, asset bootstrap, offline claim — all match code. |
| **D9.4** CLAUDE.md rewrite | **Faithful with one falsehood** | Rewritten and truthful about architecture/pipeline — except the fallback-shortcut claim (Finding 9). Note: CLAUDE.md is deliberately untracked (commit 366e6e3 pre-dates this branch), so the rewrite exists on disk only — owner's prior choice, not a branch defect. |
| **D9.5** setup script | **Faithful with nits** | Copy binary+dylibs+model, chmod, rpath patch, src-vs-dst size completeness checks (lines 62-75), smoke test paying the cold Metal compile (lines 91-121). Nits: fixed smoke port, "/inference" claim vs actual GET / (Finding 8). |
| **D9.6** missing assets → clean error | **Faithful (visibility caveat)** | `assetsPresent` fail → status `unavailable` + `WhisperAssetsMissingError` (server.ts:251-256) → mapped to `ENGINE_UNAVAILABLE` with "Transcription engine not installed — run scripts/setup-whisper.sh" (transcriber.ts:143-148) → error pill. No launch dialog. Caveat: that message is practically unreadable (Finding 2). |
| **D9.7** WebM saved before ASR, kept on failure | **Faithful** | `saveAudioFile` before `transcribePcm` (src/index.ts:1286 vs 1306); failure path never deletes it. |
| **D9.8** LOCAL-FIRST-STT §9 update + deferred-rename record | **Faithful** | docs/LOCAL-FIRST-STT.md §9 item 1 marked DONE with deviations recorded; deferred renderer-rename documented (lines 189-200). |
| **§5.2** hygiene grep zero-hits | **Fails as written — plan bug** | `rg -i 'sarvam' src ...` returns 9 hits, all either the D8-mandated `purgeLegacySarvamApiKey` (store.ts:53-57, index.ts:17,1064) or explanatory comments (server.ts:10, wav.ts:2, transcriber.ts:7). See Finding 10 / §5 plan bugs. |

---

## 3. Findings (ranked)

### Critical

None found.

### Major

**F1 — `WhisperServer` failure-path state machine holes: failed start strands the
server in `starting`/`restarting`; recovery races can swallow the auto-restart or
kill a healthy server.** *(confirmed by code reading; exact timings need runtime
verification)*

- `src/main/whisper/server.ts:299-308` — when `doStart()` fails (pollReady timeout,
  spawn error), the `catch` rethrows **without updating `this.status`**. The status
  stays `"starting"` (or `"restarting"` if entered via crash path) with
  `startPromise` cleared and no attempt in flight.
- `src/main/whisper/server.ts:318-349` — `ensureReady()` only *initiates* a start for
  `"unavailable"`/`"stopped"`. For a stranded `"starting"`/`"restarting"`/`"crashed"`
  it registers a waiter that nothing will ever resolve, so every dictation burns the
  full 4s `READY_TIMEOUT_MS` before failing into the transcriber's restart path.
- `src/main/whisper/server.ts:436-443 + 234-244` — the crash auto-restart timer calls
  `start()`, which returns the still-in-flight *doomed* `startPromise` of the crashed
  attempt (e.g. after a bind-failure crash while `pollReady` is still looping against
  the dead port). The scheduled restart is thereby a no-op and nothing reschedules —
  the stall above results.
- `src/main/whisper/server.ts:367-382 + 240` — `restart()` sets `intentionalStop=true`
  then calls `start()`; if `start()` early-returns the shared in-flight promise, the
  `intentionalStop=false` reset (which lives inside the guarded body) never runs, and
  `handleExit` (397-405) never clears the flag either. Razor-thin ordering can also
  leave `status="ready"` with `child=null/port=null` (restart's `killImmediate` lands
  between `pollReady` resolving and the ready assignment), after which `ensureReady`
  returns instantly and `transcribePcm` throws "no base URL" (transcriber.ts:56-58).
- Concrete failure scenario: whisper-server crashes (or its port is stolen at spawn) →
  auto-restart swallowed → next dictation: attempt 1 wastes 4s (`"Timed out waiting
  for whisper server..."` maps to `ASR_FAILED`, not `ENGINE_UNAVAILABLE` — the regex at
  transcriber.ts:159 doesn't match that message) → `restart()` heals it → attempt 2
  succeeds. User sees a multi-second stall or, at the margins, an avoidable error pill.
- Worse sub-case (needs runtime verification): a *cold Metal shader compile* (~7.5s on
  a fresh binary path, per docs/whisper-preflight-phase0.md) exceeds `pollReady`'s
  4s deadline → status strands while the child keeps loading; a dictation's
  `restart()` then SIGKILLs the healthy-but-late server mid-compile and respawns.
  If dictations arrive faster than 7.5s apart the shader cache may never populate
  and the engine never converges. Mitigated in practice by `setup-whisper.sh`'s
  pre-warm, but the app has no defense if the OS shader cache is evicted.
- Fix direction: in `doStart`'s catch, transition to an explicit terminal state
  (`"crashed"` → schedule restart, or `"unavailable"`); let `ensureReady` kick a
  fresh `start()` when a wait would otherwise be unresolvable; have `restart()`
  cancel/await the in-flight attempt instead of sharing it; reset `intentionalStop`
  in `handleExit` after consuming it.

**F2 — D1/D9.6 error *message* is effectively invisible to the user.**
`src/renderer/widget/App.tsx:286-319` + `src/renderer/widget/widget.css:93-115` —
the error pill renders only a 14px warning glyph; `errorMessage` is carried solely in
a `title` tooltip and an `sr-only` span. The window is click-through by default
(src/index.ts:601) and the pill auto-reverts after 3s, so a user essentially cannot
read *why* it failed — including the one message whose entire purpose is instruction:
"Transcription engine not installed — run scripts/setup-whisper.sh" (transcriber.ts:146).
The plan's D1 wording ("widget gets only user-safe text", messages "stay
user-readable (D1 displays them)") and D9.6 ("first dictation shows D1 error
'Transcription engine not installed…'") imply displayed text; README.md:60-62 also
promises "an actionable error". Concrete scenario: fresh clone, user skips
`setup-whisper.sh`, dictates → sees an anonymous ⚠ blip for 3s, no clue about the fix.
Fix direction: show short message text in the error pill (widen it), or at least a
distinct "engine not installed" visual with README pointer. Severity is Major because
the flagship recovery instruction is unreachable; downgrade to Minor if the owner
confirms glyph-only was an accepted design choice.

### Minor

**F3 — D5 budget deviation: attempt-1 ready-wait is additive, worst case ~17s not 13s.**
`transcriber.ts:53-64` — attempt 1 = `ensureReady(4000)` **then** a 4500ms request; the
plan budgeted "attempt 1 (≤4.5s incl. its ready-wait)". Full worst chain: 4 + 4.5 +
restart-ready 4 (server.ts:300) + 4.5 = 17s, plus blob assembly + `saveAudioFile` +
paste overhead, against the 20s deadline. Still fits given measured latencies
(0.1–1.2s real ASR), but the plan's "~7s margin" claim is false and margin erosion is
silent. Either tighten (share one deadline across ensureReady+request) or update the
plan arithmetic. (Also listed under §5 plan bugs.)

**F4 — Quit during startup can orphan a whisper-server until next launch.**
`server.ts:460-476` — `stop()` with `this.child === null` (e.g. `doStart` is still
awaiting `pickFreePort`, or pre-spawn) returns early **without setting
`intentionalStop`** and without cancelling the in-flight `doStart`, which then spawns
a child *after* quit was initiated (spawn at server.ts:277 happens after two awaits).
The main process exits; the child is not killed (not detached, but nothing reaps it).
Self-heals: `persistState` (284-286) re-writes the state file after `stop()`'s
`clearState`, so the next launch's sweep kills it — but plan §5.4's "normal quit →
`pgrep whisper-server` empty" can fail in this window. Needs runtime verification for
window width (~0.5s at launch / during any crash-restart). Fix: have `stop()` flag
intentional stop unconditionally and make `doStart` check it before/after spawn.

**F5 — Zombie sweep identity check is substring match, not the plan's "exact binary".**
`server.ts:158` — `cmd.includes(state.executablePath)`. D2 rejected `pkill -f` because
command-line *text* matching can kill an innocent process whose args merely contain the
path; this check reduces the candidates to one recycled PID but keeps the same matching
weakness: a reused PID running e.g. `otool -l ~/Library/.../whisper-server` or
`tail -f` on its log would match and be SIGKILLed. Probability is tiny (PID reuse ×
path-in-args), but the plan's stated bar was "zero false-positive risk". Fix: compare
the first token of `command=` (or `ps -o comm=`) for equality with `serverBin`.

**F6 — Launch warm-up `start()` has no rejection handler.**
`src/index.ts:1113` — `void getWhisperServer().start();` — with assets missing this
rejects (`WhisperAssetsMissingError` thrown at server.ts:253-255) and the rejection is
unhandled at the call site; under Node ≥15 semantics it surfaces via the global
`uncaughtException` handler (src/index.ts:93), which logs it as an "Uncaught exception
(handled gracefully)" and would even force-reset processing state if a dictation were
somehow in flight. Behavior is survivable but noisy and routes an *expected* condition
through the emergency handler. Fix: `.catch()` with a quiet log (status is already
`unavailable`; D9.6 flow is unaffected). Needs runtime verification only for the exact
Electron log behavior, not for the missing handler itself.

**F7 — Port-selection details.** `server.ts:88-90` — `PORT_RANGE_MIN + floor(random *
(MAX-MIN))` never yields 65535 (harmless off-by-one vs the documented range). More
substantively (D2): a port stolen between probe-close and spawn is handled only by the
generic crash-restart machinery — it counts a crash toward the circuit breaker and, via
F1, the scheduled restart can be swallowed. The plan's "on bind-failure exit, pick
another (max ~5 tries)" loop for the *spawn* stage does not exist as such. Acceptable
if F1 is fixed; worth a comment either way.

**F8 — setup-whisper.sh nits.**
(a) line 98: fixed smoke port `58199` — if occupied, whisper-server can't bind and the
script fails only after the full 20s curl loop with a misleading "did not become ready"
(reintroduces the port-collision class the app itself eliminated);
(b) line 91: echo says "hit /inference" but the smoke only ever GETs `/` (lines
107-113) — readiness is proven, an actual inference is not; plan D9.5 said "one curl
smoke" so this is defensible, but the message overclaims;
(c) line 78: `install_name_tool -rpath "$WHISPER_CPP_SRC" "@loader_path"` assumes the
binary's embedded `LC_RPATH` string equals the current `$WHISPER_CPP_SRC` value — for a
custom build whose embedded rpath differs (e.g. binary built in dir A, copied to dir B,
`WHISPER_CPP_SRC=B`), the tool errors and `set -e` aborts with a cryptic message. A
`-delete_rpath`-all + `-add_rpath @loader_path` sequence (or reading the actual rpath
from `otool` first) would be robust;
(d) line 55-56: if the source has no matching dylibs, the unexpanded glob produces a
confusing `cp` error rather than a clean check. All failure modes do *fail* (nothing
silently succeeds) — these are UX/robustness nits, not correctness bugs.

**F9 — CLAUDE.md falsehood: fallback paste shortcut.**
CLAUDE.md ("Pipeline" §4): "fallback hotkey **Ctrl+Cmd+V** re-pastes the last
transcript" — actual binding is `CommandOrControl+Shift+V` (src/main/platform.ts:7),
i.e. **Cmd+Shift+V** on macOS, which is what README.md:85 correctly documents.
Contributor-bar issue since CLAUDE.md is the stated first-read.

**F10 — Plan §5.2 verification step cannot pass as written.** See §5 below. The
implementation's remaining `sarvam` hits (store.ts:45-57, index.ts:17/1063-1064,
comments in server.ts:10, wav.ts:2-3, transcriber.ts:6-7) are all either the
D8-mandated purge or historical-context comments — reasonable, but the branch does not
satisfy its own recorded protocol, and nobody amended the protocol.

### Nit

**F11** — `src/main/store.ts:5`: stale header comment "Persists user settings (API
key, hotkey config, dictionary, etc.)" — there is no API key (and no dictionary) in the
schema anymore.

**F12** — `WidgetStatePayload.pipelineId` is sent to the renderer
(src/index.ts:428-433) but never read in App.tsx — the staleness guard lives entirely
main-side (which is sufficient; every error send is gated on
`activePipelineId === pipelineId`). Dead wire field; either drop it or note it as
informational in the payload comment (the index.ts:134-138 comment already half-does).

**F13** — Plan risk table promised a comment at the transcriber export warning future
contributors that concurrent requests are unreachable only by construction
(`isProcessing` guard + single call site). `transcriber.ts:34-39` has the single-seam
comment but no concurrency warning.

**F14** — `preload.ts:133-140` `onWidgetState` returns no unsubscribe function,
inconsistent with sibling APIs (`onSelectedMicChanged`, `onWidgetAudioLevel`).
Harmless for a mount-once widget; inconsistency only.

**F15** — `src/renderer/recorder.ts:626` (untouched file): comment "main process will
handle fallback" after a PCM16-streaming failure is now misleading — there is no
fallback; empty `pcmChunks` surface as `NO_AUDIO` ("No audio detected…"), which is a
visible but slightly wrong message for "your audio worklet broke". Pre-existing-ish
(the old path had no WebM ASR fallback either), but the comment should die with the
next renderer touch.

---

## 4. Quality / simplicity / contributor-bar assessment

Good overall. The three-module split (`server.ts` / `transcriber.ts` / `wav.ts`) is
exactly the plan's shape: no ceremonial `Transcriber` interface, `wav.ts` is genuinely
pure, and `transcriber.ts` is a tight 170 lines whose retry policy reads directly off
D4. Comments are unusually high-value — nearly every non-obvious decision cites the
plan/preflight doc (readiness signal, no `-sns`, SIGKILL-vs-grace rationale, the
locked `hindiMode` wire name at its one send site). Sarvam is gone from behavior; the
remaining textual traces are the mandated purge and history-explaining comments.
`src/index.ts` shrank and the pipeline is followable end-to-end; the
`pipelineId`/`processingTimer`/`session.pipelineTimer` triple-bookkeeping is the most
intricate part but each check is justified and the deadline/stale-guard behavior is
correct as read. Nothing is over-engineered; if anything, `server.ts` is slightly
*under*-engineered on failure transitions (F1) — the state union promises a machine the
transitions don't fully honor. CLAUDE.md/README are truthful against the code with the
single exception in F9. A new contributor reading CLAUDE.md + the whisper modules would
understand the pipeline.

---

## 5. Plan bugs (the plan itself got things wrong)

1. **§5.2 is self-contradictory with D8.** D8 mandates a startup
   `store.delete("sarvamApiKey")`, which necessarily puts the string "sarvam" in
   `src/`; §5.2 then demands `rg -i 'sarvam' src ...` return zero hits. Both cannot
   hold. The protocol should have exempted the purge function and comments.
2. **D5's arithmetic doesn't match its own components.** "Attempt 1 (≤4.5s incl. its
   ready-wait)" is inconsistent with `READY_TIMEOUT_MS=4000` + `ASR_REQUEST_TIMEOUT_MS
   =4500` being separate sequential budgets (which is also what the implementation
   does). The real worst case is ~17s + overhead, not "13s worst + ~7s margin". Still
   inside 20s, but the margin claim is wrong (Finding F3).
3. **D2's "on bind-failure exit, pick another (max ~5 tries)"** was specified as a
   spawn-stage loop but is only implementable/implemented as probe-retries + generic
   crash-restart; the plan never reconciled that with the circuit-breaker accounting
   (a stolen port now costs a crash-streak entry).
4. **D1/D9.6 never specified *how* the message is displayed**, which permitted the
   glyph-only pill (Finding F2). If tooltip-only was acceptable, the plan's "shows D1
   error '…run scripts/setup-whisper.sh'" wording overstated it.

---

## 6. Known-accepted issues — confirmed not reported

Silence hallucination, one-time Metal compile cost (as a *setup* concern — its
interaction with the 4s ready deadline is reported under F1 because that part is new),
renderer wire names, orphaned failure-path WebM files, absent test infra, romanization
style — all excluded per brief.
