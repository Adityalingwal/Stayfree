# Fix Implementation Report — 2026-07-30

> Implemented from: `docs/reviews/FIX-PLAN-2026-07-30.md`
> Branch: `feat/local-stt` — **kuch bhi commit/stage NAHI kiya** (working tree mein uncommitted changes hain, git Aditya handle karega).
> Scope: FIX 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 — sab implemented. FIX 2 skip (DEFERRED, alag UI PR).

---

## Per-FIX summary

### FIX 1 + 3 + 4 + 5 — `src/main/whisper/server.ts` (ek coherent overhaul)

**FIX 1 (lifecycle state machine):**
- **Generation tracking:** har spawn ab ek `ActiveChild { gen, proc, port, intentionalStop, ready, exited }` object hai. Exit handler us child object se bandha hai — stale/purane child ka exit sirf log hota hai (`stale child gen=N exited — ignored`), naye child ka handle/port kabhi clear nahi kar sakta. `intentionalStop` ab per-child hai — shared-boolean race khatam.
- **Transactional failed starts:** har failure path explicit terminal state pe jaata hai (table neeche). `"starting"` pe kabhi stranded nahi.
- **ensureReady stranded-proof:** waiter sirf tab register hota hai jab kuch use settle karega (`startPromise` in-flight, `restartTimer` scheduled, ya `lateChild` adoption). Warna fresh `start()` kick hota hai.
- **restart() serialized:** in-flight `startPromise` pehle settle hota hai (await + catch), phir current child SIGKILL + uska exit *consume* hota hai, tab naya spawn. `startPromise` share nahi hota.
- **Crash accounting:** `crashTimestamps` ready pe clear NAHI hote — sirf `PROVEN_STABLE_MS = 60s` continuous-ready ke baad (`scheduleStableClear`). Breaker retry ab loop karta hai — har failed retry agla 30s retry re-arm karta hai (`.catch` re-arm + crash-class failure ka natural re-arm; double-arm safe kyunki schedule pehle purana timer clear karta hai). Breaker contract: **5th crash in 60s window trips** (`>=`, pehle `>` tha = 6th).
- **lateReady adoption (slow shader-compile case):** pollReady timeout + child ZINDA → child ko kill NAHI karte. Attempt fail hota hai (waiters reject, status `"crashed"`), lekin wahi child background mein `LATE_READY_GRACE_MS = 15s` tak poll hota rehta hai. Ready aa gaya → adopt (`"ready"`, waiters resolve, stable-clear armed). Nahi aaya / exit ho gaya → kill + **EK** crash count + normal backoff/breaker se restart schedule.

**FIX 3 (exact-match sweep):** sweep ab `ps -p PID -o comm=` (process ka apna executable path) ko `state.executablePath` se **strict equality** se compare karta hai. `tail -f <path>` / `otool -l <path>` / editor jaise processes — jinke sirf *arguments* mein path aata hai — ab match ho hi nahi sakte, kyunki unka `comm=` unka apna binary hota hai (`/usr/bin/tail` etc.), hamara path nahi. Baaki sweep logic (state file read → validate → SIGKILL → delete) unchanged.

**FIX 4 (quit races):** `stop()` sabse pehle permanent `shuttingDown = true` set karta hai (child ho ya na ho). Uske baad:
- `start()` / `restart()` / `ensureReady()` turant reject: `"Whisper server is shutting down"`.
- In-flight `doStart` flag ko pre-port-pick, pre-spawn, post-spawn, aur post-poll — har await ke baad check karta hai; set mila to `abortForShutdown()`: attempt ka child (agar spawn ho chuka) SIGKILL, state file clear, status `"stopped"`, throw.
- `stop()` ab `child === null` pe early-return nahi karta jab attempt in-flight ho — pehle `startPromise` settle await karta hai (jo shuttingDown ki wajah se jaldi abort hota hai), phir lateChild abandon+kill, phir current child ka SIGTERM → 2s → SIGKILL.
- Transcriber side unchanged (plan ke mutabik) — `restart()` reject hoga to mapError generic error dega, pipeline surface karti hai.

**FIX 5 (port retry + child-bound readiness):**
- `doStart()` ke andar bounded loop (`SPAWN_ATTEMPTS_MAX = 5`): child ready hone se PEHLE exit kar jaaye → bind-failure class maana jata hai → naya port + immediate retry. Ye retries `crashTimestamps` mein COUNT NAHI hote. 5 attempts ke baad hi crash-class terminal (`"crashed"` + crash count + scheduled restart).
- `pollChildReady()` apne child se bandha hai: (a) child exit → poll turant `"exited"` return karta hai; (b) HTTP response sirf tab `"ready"` jab response ke waqt hamara child zinda ho — foreign process (stolen port) ka response humein kabhi ready nahi bana sakta.
- Off-by-one: `Math.floor(Math.random() * (MAX - MIN + 1))` — 65535 ab reachable.

### FIX 6 — `src/index.ts` warm-up `.catch()`
`void getWhisperServer().start();` → explicit `.catch()` with quiet log:
`[Whisper] Warm-up start failed (engine unavailable until fixed): <message>`. Koi state mutation nahi. Assets-missing (aur FIX 4 ke baad shutdown-reject) ab emergency `uncaughtException` handler tak kabhi nahi pahunchte.

### FIX 7 — `src/index.ts` `resetAfterRecorderError()`
Idle reset se pehle ab `sendWidgetState("error", { message, pipelineId: session.pipelineId })` jaata hai — wahi error mechanism jo ASR failures ka hai (widget renderer idle ko ignore karta hai jab tak uska error-revert timer pending hai — verify kiya `widget/App.tsx:148-151` mein, isliye trailing idle send safe hai). Tray reset / session cleanup unchanged.

### FIX 8 — `src/main/whisper/transcriber.ts` + `src/index.ts`
- `transcribePcm(pcm16, shouldContinue?: () => boolean)` — optional param, backward-safe. Checks: (a) attempt fail ke baad, restart se PEHLE (`!shouldContinue()` → mapped error throw, no restart, no retry); (b) attempt 2 shuru hone se pehle (loop-top check, `attempt > 1`). In-flight HTTP request force-abort nahi hota (apne 4.5s timeout se settle hota hai) — minimal scope, AbortController plumbing deferred.
- Call site: `transcribePcm(Buffer.concat(session.pcmChunks), () => activePipelineId === pipelineId)`.
- `PROCESSING_TIMEOUT_MS = 20_000` → `12_000` (ek hi jagah), comment mein naya rationale.
- `READY_TIMEOUT_MS`/`ASR_REQUEST_TIMEOUT_MS` unchanged.

### FIX 9 — `scripts/setup-whisper.sh` (staged atomic install)
- **Staging:** sab kuch `whisper.staging.$$/` (same volume sibling) mein: copy → completeness check **har file pe** (binary + har dylib + model, size-compared; unmatched dylib glob = clean error via `nullglob` + count check) → chmod → rpath patch → codesign → smoke test staging binary pe. Sab pass → atomic swap (`mv` old aside → `mv` staging in → aside delete). Fail kahin bhi → trap: smoke kill, staging delete, aur agar swap beech mein toota to purana install restore. Existing install kabhi destroy nahi hota.
- **Smoke hardening:** fixed 58199 gone — dynamic free port (`lsof` probe, 20 tries, 49152-65535). Success = **dono**: `kill -0 $SMOKE_PID` (spawned server zinda) **aur** usi port se HTTP response; loop ke andar har iteration pe death-check (server mar gaya to turant fail + log dump), aur response ke baad ek aur alive re-check. Echo messages ab actual test se match karte hain (GET `/` readiness; `/inference` ka jhootha claim hataya).
- **Robust rpath:** binary ke ASLI `LC_RPATH` entries `otool -l` se read hote hain; har **absolute** rpath `-delete_rpath` se hatta hai; `@loader_path` add hota hai (agar pehle se nahi); phir codesign + verification (`@loader_path` present AND koi absolute rpath survive nahi kiya). Guess-based `-rpath old new` gone.

### FIX 10 — nits bundle
1. `transcriber.ts`: `ErrorAction` type + `PipelineError.action` field removed, constructor simplified. `rg "ErrorAction"` → zero hits; `rg '\.action\b' src/` → zero hits (koi consumer nahi tha).
2. `store.ts` header ab sach hai: hotkey/mic/sound/onboarding/lastTranscript/history — no API key, no dictionary; purge ka reference.
3. `recorder.ts:626` comment ab sach: WebM sirf saved-audio ke liye, transcription fallback EXIST nahi karta — no chunks → `NO_AUDIO`. (Sirf comment; renderer logic untouched.)
4. `index.ts` `WidgetStatePayload` comment: `pipelineId` "informational for renderer; staleness is enforced main-side" explicitly likha. Field kept.
5. `transcriber.ts` `transcribePcm` doc: CONCURRENCY WARNING added (unreachable-by-construction, parallel callers mat banao — plan §4 commitment).
6. `preload.ts` `onWidgetState` ab unsubscribe fn return karta hai (siblings jaisa); `Window` type updated (`=> () => void`). Widget mount-once hai — behavior same.

### FIX 11 — `CLAUDE.md` (repo root, untracked by design)
- "Three Electron BrowserWindows" → "Four".
- "fallback hotkey Ctrl+Cmd+V" → "Cmd+Shift+V (`CommandOrControl+Shift+V`, see `src/main/platform.ts`)" — platform.ts:7 se match.
- `git check-ignore CLAUDE.md` → still ignored/untracked. `.gitignore` untouched.

### FIX 12 — `docs/LOCAL-STT-MIGRATION-PLAN.md` amendments
1. §5.2 amended: runtime-Sarvam-integration hi asli check; `purgeLegacySarvamApiKey` (store.ts + index.ts call site) aur historical-context comments exempt.
2. D5 rewritten: 12s deadline, corrected arithmetic (purana 13s-claim galat tha, asli worst ~17s), hung-server self-heal chain (~11s) fits, cancellation callback, 10s-rejected note.
3. Risk table: "pkill sweep" → "owned-PID validated sweep (exact executable match)".
4. D3 + risk table ek contract pe: **5th crash in rolling 60s window trips the breaker**; breaker retry looping bhi documented; proven-stable clear bhi.
5. Naya "§7 Post-review amendments (2026-07-30)" section: review pointers, FIX-plan pointer, sab canon deviations (12s deadline, exact-match sweep, bounded non-crash-counting port-retry, lateReady adoption, shuttingDown, cancellation callback, staged setup script, CLAUDE.md untracked-by-choice, FIX 2 deferred).

---

## server.ts failure-path state transitions (FIX 1 requirement)

| # | Failure path | Terminal transition | Follow-up (kaun aage badhata hai) |
|---|---|---|---|
| 1 | Assets missing (`doStart` pre-spawn) | `unavailable` | waiters reject (`WhisperAssetsMissingError`); agli dictation ka `ensureReady` force clean attempt (D9.6) |
| 2 | `pickFreePort` 5 probes fail | `crashed` | crash counted → backoff `restartTimer` → `start()` (ya breaker trip) |
| 3 | Child exits before ready (bind-fail class), attempts 1-4 | *(no terminal — loop)* | naya port, immediate retry; NOT crash-counted |
| 4 | Child exits before ready, 5th/last attempt | `crashed` | EK crash counted → backoff restart (ya breaker) |
| 5 | pollReady timeout, child ALIVE (shader compile) | `crashed` (attempt fail; waiters reject) | child zinda + adoption poll ≤15s: ready → **adopt** `ready` (waiters resolve, stable-clear armed); nahi → kill + EK crash count → backoff restart/breaker |
| 6 | Ready child crashes unexpectedly (`handleExit`) | `crashed` | stable-clear cancel; crash counted; <5-in-60s → backoff `restartTimer`; 5th → `unavailable` + breaker |
| 7 | Breaker retry (`start()`) fails | jo bhi failure class ho (upar 1/2/4/5) | crash-class → breaker re-trips + re-arm; non-crash (assets) → `.catch` re-arm — 30s loop kabhi nahi marta |
| 8 | `shuttingDown` during doStart (pre/post-spawn/post-poll) | `stopped` | attempt child SIGKILL, state file clear; koi naya spawn kabhi nahi |
| 9 | Stale (old-gen) child ka late exit | *(no transition)* | sirf log — `handleExit` gen-check pe ignore |
| 10 | `stop()` normal | `stopping` → `stopped` | SIGTERM → 2s grace → SIGKILL; state file clear |
| 11 | `restart()` | (settle) → `stopped` → `starting` → ... | in-flight attempt settled, child killed + exit consumed, lateChild abandoned, phir fresh start |

Har path pe status kabhi `"starting"` pe stranded nahi rehta, aur har `"crashed"` ke saath koi na koi scheduled follow-up (restartTimer / adoption watchdog / breaker) zinda hota hai — isi liye `ensureReady` ka waiter hamesha settle hota hai (apne timeout se bhi bounded hai).

## Verification results

| Check | Result |
|---|---|
| `npm run lint` | **PASS** (clean, zero warnings) — final code pe re-run bhi clean |
| `npm run package` | **PASS** (webpack bundles + packaging clean; repo ka only working type-check) — final code pe re-run bhi clean |
| FIX 6: `rg "void getWhisperServer" src/` | **zero hits** (warm-up + before-quit dono; catch handler log-only, koi state mutation nahi) |
| FIX 10: `rg "ErrorAction" src/` / `rg '\.action\b' src/` | **zero hits** |
| FIX 9: `bash -n scripts/setup-whisper.sh` | **PASS** |
| FIX 9 dry-walk | occupied port → dynamic port pick karta hai, aur bind-fail death loop mein pakdi jaati hai (kill -0); missing dylib → clean count-check error, staging delete, install intact; interrupted copy → completeness check fail ya trap restore — live install har case mein intact |
| FIX 3 code-walk | `comm=` = process ka apna executable → `tail`/`otool`/editor ka comm `/usr/bin/...` hota hai, equality kabhi match nahi; sirf whisper-server binary khud match karta hai |
| FIX 4 code-walk | (a) quit during ASR-retry: `restart()` pehli line pe reject → no spawn; (b) quit during startup: doStart pre/post-spawn checks → abort/kill → no orphan |
| FIX 5 code-walk | bind-fail → new port ≤5 tries, breaker untouched; child-dead-during-poll → `"exited"` turant, foreign HTTP response ready nahi banata |
| FIX 7 code-walk | recorder-error IPC → `resetAfterRecorderError` → widget ko `error` (message ke saath) → phir idle (widget error-timer ke dauraan idle ignore karta hai). Recorder failure ka koi path ab silent-idle nahi |
| FIX 8 code-walk | deadline fire → `activePipelineId = null` → stale transcriber ka agla decision point (`shouldContinue()` false) → no restart, no attempt 2, clean throw. Happy path unchanged (callback true return karta hai). 12s ek hi jagah |
| FIX 11 | shortcut == `platform.ts` binding; window count == 4; `git check-ignore CLAUDE.md` → still ignored |
| Git | kuch bhi staged/committed nahi; sirf working-tree modifications |

## Deviations / notes (koi improvised design nahi — sab plan ke rules ke andar, ya explicitly flagged)

1. **lateReady "scheduled retry" ka placement:** plan rule 6 kehta hai attempt fail pe "status crashed + scheduled retry" AUR child ko 15s grace. Literal parallel retry-timer (backoff[0] = 0ms) adoption ko turant kill kar deta (wahi kill-loop jo rule 6 rokna chahta hai). Isliye retry **adoption watchdog ke give-up par** schedule hota hai (15s pe kill → crash count → backoff/breaker) — plan ki apni line "Agar 15s tak bhi nahi, tab kill" ke saath consistent, aur "(Simple implementation acceptable)" clause ke andar.
2. **Timeout-with-alive-child pe crash kab count hota hai:** adoption window ke END pe (give-up), start pe nahi — warna converge hone wala shader-compile case bhi breaker ki taraf count hota. Poore slow-start episode ka EK crash count.
3. **`restart()` ab `crashTimestamps` clear nahi karta** (purana code karta tha). Plan rule 5 ("sirf proven-stable pe clear") ke spirit mein — warna ASR-retry ka restart breaker ko reset kar sakta tha. Flag kar raha hoon kyunki plan ne restart() ke bare mein explicitly nahi likha tha.
4. **Before-quit ka `void getWhisperServer().stop()` bhi de-`void` kiya** (sirf formatting — `.catch()` wahan pehle se tha) taaki FIX 6 ka `rg` verification zero-hits pe pass ho.
5. **CLAUDE.md "20s processing-timeout" → "12s"** — FIX 11 ke 2 listed items se bahar, lekin FIX 8 ka direct consequence tha; stale chhodna galat hota. Flagged.
6. **`pickFreePort`-failure terminal transition** — FIX 1 rule 2 ("har failed start transactional") ka hi case hai jo plan ke sub-defect list mein explicitly nahi tha; `crashed` + scheduled restart pe land karta hai.
7. **Setup-script Metal-cache caveat (open note, no code risk):** smoke ab STAGING path pe chalta hai; atomic `mv` inode preserve karta hai, lekin agar macOS ka per-path shader cache final path ko fresh maane to app ka PEHLA spawn ~7.5s cold compile pay karega. App ise tolerate karta hai — FIX 1 ka lateReady adoption exactly is case ko 15s tak converge karne deta hai. Script comment mein documented. (Post-swap warm-run add NAHI kiya — spec-exact raha; chahiye to 3-line addition hai.)
8. **Shutdown-reject ka error code:** quit ke dauraan `restart()` reject ("shutting down") transcriber ke `mapError` mein `ASR_FAILED` ban jata hai, `ENGINE_UNAVAILABLE` nahi (plan FIX 4 note ne ENGINE_UNAVAILABLE-class kaha tha, lekin "Transcriber side kisi change ki zaroorat nahi" bhi explicitly locked tha — isliye transcriber untouched). App quit ho raha hota hai, user-visible farak zero.

## Not done (by instruction)

- FIX 2 (widget error-message UI) — DEFERRED, alag PR.
- Runtime smoke / `npm start` / whisper-server spawn — Aditya khud karega (handoff doc Tests 1-4 + plan §5.4 quit-test).
- `~/stt-testing/` aur `~/Library/Application Support/StayFree/` — touch nahi kiya.
