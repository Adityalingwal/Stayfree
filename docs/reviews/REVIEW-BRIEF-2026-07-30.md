# Independent Code Review Brief — feat/local-stt (2026-07-30)

You are performing an **independent, adversarial code review** of the branch
`feat/local-stt` in the repo at `/Users/mac/Desktop/StayFree`. Another reviewer
is doing the same review in parallel; your findings will be cross-checked
against theirs, so be thorough and honest — do not soften findings, do not
invent findings to seem useful.

## What this branch does

StayFree is a macOS Electron tray dictation app (hold hotkey → speak → release
→ transcript auto-pasted). This branch replaces the Sarvam cloud STT API
(WebSocket streaming) with a fully local `whisper.cpp` sidecar
(`whisper-server` child process, Metal, Hinglish-tuned q8_0 model). v1 scope is
full-buffer record→stop→transcribe (no streaming). 21 files changed,
+1611/−1055, 5 commits (`71ee238..9473d3b`).

## Required reading (in this order)

1. `docs/LOCAL-STT-MIGRATION-PLAN.md` — the APPROVED plan. Decisions D1–D9 are
   the contract this implementation must honor. This is your review baseline.
2. `docs/whisper-preflight-phase0.md` — measured Phase-0 facts the plan relies on.
3. `CLAUDE.md` (repo root) — post-migration architecture description (also a
   review target: is it truthful vs the code?).
4. The full diff: `git diff main...feat/local-stt` (run it yourself). For the
   new modules read the complete files, not just hunks:
   - `src/main/whisper/server.ts` (520 lines — the biggest new surface)
   - `src/main/whisper/transcriber.ts`
   - `src/main/whisper/wav.ts`
   - `src/index.ts` (pipeline rewire — read the whole current file)
   - `scripts/setup-whisper.sh`
   - `src/preload.ts`, `src/renderer/widget/App.tsx`, `src/renderer/widget/widget.css`
   - `src/main/store.ts`, `webpack.main.config.ts`, `package.json`, `README.md`

## Review dimensions (all three are required)

### 1. Plan fidelity — D1–D9
For EACH decision D1 through D9 in the plan: is it implemented exactly as
specified? Produce a table: decision → verdict (faithful / deviation / missing)
→ evidence (file:line). Silent deviations from the plan are findings even if
the deviation is arguably fine. Also check plan §2 D9's numbered items (rpath
patch in setup script, worklet delete, README rewrite, CLAUDE.md rewrite,
setup script completeness checks, missing-assets clean error) and §5
verification-protocol claims that are checkable statically (e.g. `rg -i
'sarvam|SARVAM_API_KEY'` over src/ package.json webpack config README must be
clean).

### 2. Bugs / regressions / edge cases
Hunt hard for real defects. Priority areas:
- **Lifecycle races:** server crash during an in-flight transcribe; app quit
  during recording/processing; restart() racing ensureReady(); circuit-breaker
  logic (5 crashes/60s → unavailable → 30s retry); intentional-stop suppressing
  auto-restart; zombie-sweep PID validation (can it ever kill a wrong process?
  can it miss an orphan?); dynamic-port probe race (port stolen between probe
  and spawn — is the bind-failure retry real?).
- **Pipeline correctness:** stale `pipelineId` can never overwrite a newer
  recording's widget state; 20s deadline path emits error state (not silent
  reset); `isProcessing` guard; `finally` cleanup always runs; retry policy
  exactly as D4 (NO_AUDIO/NO_TRANSCRIPT never retried, engine failures retried
  exactly once after restart); paste never fires on empty transcript.
- **Resource leaks:** timers, event listeners, child process handles, tmp files,
  AbortController, spawned-but-failed servers.
- **Error mapping:** every failure path maps to a user-safe widget message;
  regex-based error classification in transcriber.ts `mapError` (fragile?).
- **Regressions in untouched paths:** hotkey flow, widget click flow, paste,
  history rotation, settings UI, onboarding — did the rewire break anything
  that used to work?
- **wav.ts:** header correctness (sizes, sample rate, mono, 16-bit).
- **setup-whisper.sh:** failure modes (partial copy, missing source, rpath
  patch idempotency, codesign failure).

### 3. Code quality / simplicity / contributor bar
- Is anything over-engineered or needlessly complex for what it does? (The plan
  explicitly rejected ceremony — e.g. no formal Transcriber interface.)
- Dead code, leftover Sarvam traces, misleading names, stale comments.
- Would a new contributor reading CLAUDE.md + the code understand the pipeline?
  Are README/CLAUDE.md claims TRUTHFUL vs actual code behavior?
- Naming per D6 (main-process "Hindi" concepts renamed; renderer wire names
  intentionally NOT renamed — flagging those as a bug would be wrong).

## Known/accepted issues — do NOT report these as findings

These are already known, measured, and owner-accepted (or explicitly deferred):
1. Silence hallucination (silent recording → non-empty fake text like "Haan.")
   — open ship-flag, `-sns` measured ineffective, energy pre-gate forbidden
   (misclassifies real first-words).
2. One-time ~7.5s Metal shader compile on a fresh binary path — setup script
   pre-warms; future installer concern.
3. Renderer wire names `hindiMode` / `audio-chunk-stream` unchanged — deferred
   to streaming phase by decision D6.
4. Failure-path WebM files orphaned on disk (not in history) — pre-existing,
   deferred product decision.
5. No automated test infra — struck by owner; manual protocol only.
6. Romanization style differences (yah/yeh etc.) — fine-tuning phase.

## Hard constraints

- **READ-ONLY review.** Do not modify any code, do not commit, do not push, do
  not run `npm start` / builds / the app, do not spawn whisper-server. Static
  analysis + git commands + file reads only.
- Never touch `~/stt-testing/` (gold test set) or `~/Library/Application
  Support/StayFree/`.
- If something is unclear or you cannot verify a suspicion statically, report
  it as "needs runtime verification" with your reasoning — do not guess, do not
  improvise.

## Output format (markdown)

1. **Verdict line** — ship-ready after fixes? / ship-ready as-is? / not ready.
2. **D1–D9 fidelity table** (decision / verdict / evidence).
3. **Findings, ranked by severity** — Critical / Major / Minor / Nit. Each:
   - `file:line`, one-line claim, why it's wrong (with evidence from the code),
     concrete failure scenario, suggested fix direction.
   - Only report things you actually verified in the code. Distinguish
     "confirmed defect" vs "suspicion needing runtime check".
4. **Quality/simplicity assessment** — short prose, specific.
5. **Anything the plan itself got wrong** (plan bugs are findings too).
