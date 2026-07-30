# Independent Code Review — `feat/local-stt`

**Verdict: Not ready.** Core migration direction sahi hai, lekin sidecar lifecycle mein multiple Major defects hain—restart ownership race, ineffective circuit breaker, unsafe zombie PID validation, failed-start leakage, aur quit-time respawn race. Inhe fix aur runtime lifecycle smoke ke bina ship nahi karna chahiye.

## D1–D9 plan-fidelity table

| Decision | Verdict | Evidence |
|---|---|---|
| **D1 — Widget error state** | **Deviation** | Typed payload aur 20s error state implemented hain (`src/index.ts:127-143`, `src/index.ts:524-543`, `src/index.ts:1375-1396`). Lekin message visually render nahi hota—sirf `title` aur `.sr-only` mein hai (`src/renderer/widget/App.tsx:286-319`, `src/renderer/widget/widget.css:103-116`). Renderer `pipelineId` ko compare bhi nahi karta (`src/renderer/widget/App.tsx:132-163`), aur field contract mein optional hai (`src/preload.ts:23-27`). |
| **D2 — Dynamic port + validated zombie sweep** | **Deviation** | Random probe present hai (`src/main/whisper/server.ts:85-105`), lekin bind-failure ke liye five-attempt spawn retry nahi hai (`src/main/whisper/server.ts:264-307`). Zombie validation exact executable match nahi, substring `includes()` hai (`src/main/whisper/server.ts:142-165`). |
| **D3 — Lifecycle** | **Deviation** | Required API/states, async warm start, flags, stdio aur graceful quit broadly present hain (`src/main/whisper/server.ts:214-244`, `src/main/whisper/server.ts:264-300`, `src/index.ts:1109-1114`, `src/index.ts:1422-1463`). Lekin child-exit ownership, failed-start cleanup, crash accounting aur stop/restart serialization broken hain. |
| **D4 — Transcriber/retry/session cleanup** | **Faithful** | Empty PCM/empty transcript non-retryable hain; other failures restart karke at most once retry hote hain (`src/main/whisper/transcriber.ts:40-100`). PCM accumulate-only path hai (`src/index.ts:1193-1204`); transcript trim, history/paste guards aur `finally` cleanup implemented hain (`src/index.ts:1305-1401`). |
| **D5 — Timeouts/end-to-end deadline** | **Deviation** | Constants correct hain (`src/main/whisper/transcriber.ts:29-32`, `src/index.ts:83-84`), deadline release par arm hota hai (`src/index.ts:999-1010`, `src/index.ts:1146-1159`), aur restart SIGKILL immediate hai (`src/main/whisper/server.ts:364-395`). Lekin 20s deadline operation ko abort nahi karta—sirf state invalidate karta hai (`src/index.ts:524-545`); old transcriber/server lifecycle work continue kar sakta hai. |
| **D6 — Naming** | **Faithful** | Main-process session names recast hain (`src/index.ts:71-81`, `src/index.ts:436-464`); renderer wire names intentionally retained aur documented hain (`src/index.ts:505-510`, `src/index.ts:1193-1197`). |
| **D7 — Decode flags** | **Faithful** | Exact flags `-l hi -nt -bs 1 -bo 1 -t 4`, dynamic host/port, model aur tmp-dir present hain; no `-sns`, `--prompt`, or `--convert` (`src/main/whisper/server.ts:27-30`, `src/main/whisper/server.ts:264-275`). |
| **D8 — Credential/dependency hygiene** | **Faithful** | Store schema/API key IPC removed aur idempotent purge present hai (`src/main/store.ts:16-57`, `src/index.ts:907-945`, `src/index.ts:1062-1065`). Direct `ws`, `dotenv`, `@types/ws` dependencies/webpack external removed (`package.json:53-62`, `webpack.main.config.ts:17-39`). Onboarding copy local-only hai (`src/renderer/onboarding.tsx:156-161`). |
| **D9 — Additional required work** | **Deviation** | Setup script copies, patches, signs and checks binary/model (`scripts/setup-whisper.sh:37-89`); README rewritten (`README.md:5-75`); dead worklet file deleted and inline worklet remains (`src/renderer/recorder.ts:64-121`). Lekin `CLAUDE.md` branch mein tracked hi nahi—root file ignored hai (`.gitignore:11`)—aur exact hygiene command cannot pass. Setup smoke/completeness mein bhi defects hain. |

## Findings, ranked by severity

### Critical

None.

### Major

1. **Confirmed defect — `src/main/whisper/server.ts:294`, `src/main/whisper/server.ts:367-381`, `src/main/whisper/server.ts:397-412`: an old child’s exit can be attributed to its replacement.**

   `restart()` sets `intentionalStop=true`, sends SIGKILL, and immediately calls `start()`. `start()` resets the shared boolean to `false` before the killed child’s asynchronous `exit` event is guaranteed to arrive. `handleExit()` receives no child identity and unconditionally clears `this.child`/`this.port`.

   Failure scenario: attempt 1 fails → restart kills child A → child B starts → A’s late exit is treated as B’s unexpected crash. Depending on timing, it can clear B’s handle/port, fail waiters, and schedule an unnecessary restart.

   Suggested direction: associate every handler with the exact child/generation, ignore exits from non-current children, and await the old child’s terminal event before spawning its replacement. Intentional-stop state should be per child, not one mutable global boolean.

2. **Confirmed defect — `src/main/whisper/server.ts:301-302`, `src/main/whisper/server.ts:415-455`: crash backoff/circuit breaker cannot control a normal crash loop.**

   Every successful readiness probe clears `crashTimestamps`. A server that becomes ready and crashes one second later therefore always returns to crash count 1 and receives the 0ms backoff. The `>5 crashes/60s` breaker never trips. Even if it did, `scheduleCircuitBreakerRetry()` schedules only one attempt; a failed retry does not schedule the next 30s retry.

   Failure scenario: a binary/model combination loads successfully and crashes shortly afterward. StayFree hot-respawns it indefinitely with no increasing delay, causing repeated CPU/Metal/RAM churn.

   Suggested direction: retain the rolling 60s crash history across short-lived ready states, reset it only after a proven stable interval, and re-arm the 30s retry cadence after every failed breaker retry.

3. **Confirmed defect — `src/main/whisper/server.ts:299-308`, `src/main/whisper/server.ts:384-395`, `src/index.ts:1109-1114`: a failed start can leave a live child and a permanently stale `starting` state.**

   If `pollReady()` times out while the process is still alive or still loading, `doStart()` only rejects waiters and throws. It does not kill that child, clear its state file/port, or transition to `crashed`/`unavailable`. The launch warm-up promise is also discarded without `.catch()`.

   Failure scenario: model load takes over four seconds or the server hangs before binding. The sidecar continues consuming resources, but the manager remains `starting`; if it later becomes healthy, nobody marks it ready. Missing assets likewise generate an unhandled rejected warm-up promise.

   Suggested direction: make every failed start transactional—terminate the exact spawned child, clear owned state, set a terminal lifecycle state, and schedule the appropriate retry. Catch and log the launch warm-up rejection explicitly.

4. **Confirmed defect — `src/main/whisper/server.ts:136-175`: zombie validation can SIGKILL an unrelated reused PID.**

   The plan requires validation that the PID is the exact owned executable. The code instead tests `cmd.includes(state.executablePath)`. This is the same false-positive class the plan explicitly rejected.

   Failure scenario: after a crash, the PID is reused by an editor, diagnostic command, shell, or other process whose command arguments mention the whisper-server path. On the next launch, StayFree kills that unrelated process.

   Suggested direction: validate the actual executable identity using an executable-path primitive such as `proc_pidpath`/equivalent, plus process ownership where possible. Do not infer identity from substring matching a full command line.

5. **Confirmed concurrency defect; reproduction timing needs runtime verification — `src/main/whisper/transcriber.ts:88-99`, `src/main/whisper/server.ts:367-381`, `src/main/whisper/server.ts:460-509`, `src/index.ts:1429-1463`: app quit can race an in-flight retry and leave a replacement server orphaned.**

   `before-quit` calls `stop()`, but an in-flight failed request independently calls `restart()`. There is no shutdown flag preventing `start()`/`restart()` while stopping. `stop()` also unconditionally clears the shared child reference after awaiting its original child.

   Failure scenario: quit during ASR → stop sends SIGTERM to child A → fetch fails and transcriber calls restart → child B starts. The original `stop()` may then clear B’s shared handle/state, or restart may happen after the first stop completes. Since `whisperStopped` is already true, the second `before-quit` pass does not stop B.

   Suggested direction: introduce a terminal `shuttingDown` state that rejects `start()`, `ensureReady()` and `restart()`; abort the active pipeline on quit; serialize lifecycle mutations around child generations.

6. **Confirmed D2 deviation — `src/main/whisper/server.ts:85-105`, `src/main/whisper/server.ts:264-307`, `src/main/whisper/server.ts:397-443`: the advertised bind-failure retry does not exist.**

   The code probes a free port once per `doStart()`, releases it, and spawns once. There is no loop that detects bind failure and immediately chooses another port up to five times. `pollReady()` also accepts any HTTP response, without proving that the response belongs to the spawned child.

   Failure scenario: another process takes the port between probe and spawn. The sidecar exits and enters generic crash recovery; if the occupying service answers HTTP, readiness can even observe the unrelated service.

   Suggested direction: make probe→spawn→ready one bounded attempt loop, tie readiness to the current live child, and repick immediately when that child exits with bind failure.

7. **Confirmed D1/product defect — `src/renderer/widget/App.tsx:128-163`, `src/renderer/widget/App.tsx:286-319`, `src/renderer/widget/widget.css:93-116`: the user-safe error message is not visibly shown.**

   The renderer stores the message, but the visible pill contains only an icon. Text is restricted to a short-lived `title` tooltip and an element explicitly hidden with `.sr-only`. The renderer also never uses `pipelineId` for stale-event ordering.

   Failure scenario: missing assets produce “run scripts/setup-whisper.sh”, but the user sees only a red warning icon for three seconds. README’s promise of an actionable first-dictation error is therefore false.

   Suggested direction: render the message visibly in a wider pill/bubble, keep it restricted to the error state, and track the latest pipeline ID in the renderer so older payloads cannot supersede newer state.

### Minor

1. **Confirmed defect — `src/index.ts:466-490`: recorder failures discard an already user-safe message.**

   `resetAfterRecorderError()` receives messages such as microphone blocked/disconnected, logs them, then sends only `idle`.

   Failure scenario: the mic disconnects while recording; the widget silently collapses with no explanation.

   Suggested direction: send the supplied message through the widget error state before the routine idle reset.

2. **Confirmed D5 deviation — `src/index.ts:524-545`: the 20s deadline invalidates UI state but does not cancel underlying work.**

   The deadline clears `activePipelineId`, but neither aborts `fetch` nor signals `transcribePcm()`/`restart()` to stop. The comment claiming there is no in-flight network operation is inaccurate for the local HTTP request.

   Failure scenario: an abnormal server operation survives the deadline, a new recording starts, and the stale operation later restarts or otherwise mutates the shared sidecar during the new recording.

   Suggested direction: create a pipeline-level `AbortController`, pass its signal through readiness/request/retry, and prevent retry/restart once the pipeline is cancelled.

3. **Confirmed setup defect — `scripts/setup-whisper.sh:52-89`, `scripts/setup-whisper.sh:91-121`: installation is non-transactional and the smoke test can false-pass.**

   Files are copied directly over the live destination. A disk-full/interrupted copy can destroy a previously working install. Explicit size checks cover only binary/model, not dylibs. Smoke uses fixed port `58199`, and success is defined solely as any response from that port—there is no check that `SMOKE_PID` is still alive or owns the response.

   Failure scenario: another service already owns 58199; whisper-server exits on bind failure, curl reaches the unrelated service, and the script prints “Setup complete.”

   Suggested direction: stage all assets in a temporary sibling directory, verify every required file, patch/sign/smoke there using a dynamic port tied to the child, then atomically replace the destination.

4. **Confirmed contributor-doc deviation — `.gitignore:11`, `CLAUDE.md:35-64`: the required `CLAUDE.md` rewrite is not part of the branch, and the local ignored copy is internally inaccurate.**

   `CLAUDE.md` is ignored and absent from both `main` and `feat/local-stt`, so D9’s rewrite cannot be delivered by this branch. The local copy also says “Three BrowserWindows” while immediately listing recorder, onboarding, settings and widget—four windows.

   Suggested direction: either track the contributor document as an intentional branch artifact or change the approved plan/repository policy to name the durable tracked document. Correct the window count.

### Nit

1. **`src/main/whisper/transcriber.ts:16-26`: dead `ErrorAction`/`action` API remains.**

   No error supplies or consumes `action`; it is Sarvam-era ceremony in an otherwise intentionally small seam. Remove it unless a real caller needs it.

2. **`src/main/store.ts:3-6`, `src/renderer/recorder.ts:626-627`: comments are stale.**

   The store still describes API-key persistence, and the recorder says main will handle a WebM fallback even though the new pipeline transcribes PCM only. Update comments so contributors do not infer nonexistent behavior.

## Quality / simplicity assessment

Three-module split sensible hai: `wav.ts` pure aur easy to reason about hai, `transcriber.ts` compact hai, aur formal one-implementation interface avoid karna plan ke YAGNI goal ke aligned hai. PCM accumulation, empty-transcript handling, retry classification, history rotation, stale pipeline guards, and no-empty-paste behavior code se clear hain.

Weak point `server.ts` hai. 520-line lifecycle manager inherently stateful hai, lekin child identity aur lifecycle transitions serialized nahi hain. Shared `intentionalStop`, shared `child`, timers, and `startPromise` independently mutate hote hain; isi wajah se restart, crash, failed start aur quit paths ek doosre ko invalidate kar sakte hain. Contributor bar ke liye explicit child generations and one serialized lifecycle transition path zaroori hain.

Static checks performed:

- Exact `git diff main...feat/local-stt` reviewed at HEAD `9473d3b00b88`.
- `git diff --check main...feat/local-stt` clean.
- `bash -n scripts/setup-whisper.sh` clean.
- Direct `ws`/`dotenv` imports and old Sarvam transcriber references absent.
- `package-lock.json` mein remaining `ws`/`@types/ws` entries transitive hain, which the plan explicitly allows.
- `npm run package`, `npm run lint`, app launch, and whisper-server spawn nahi kiye, per read-only/static-only hard constraints.
- Koi repository file modify nahi hui.

## Anything the plan itself got wrong

1. **D8 and verification §5 contradict each other.** D8 requires source code to execute `store.delete("sarvamApiKey")`, while §5 requires `rg -i 'sarvam|SARVAM_API_KEY' src ...` to return zero hits. Both simultaneously possible nahi hain. Current grep finds the intentional purge plus migration comments, although no active Sarvam integration remains. Protocol should whitelist the purge module/string and historical migration comments, or search specifically for runtime imports, endpoints, env access and dependencies.

2. **D5’s timeout arithmetic is internally inconsistent.** Plan defines `READY_TIMEOUT_MS=4000` and `ASR_REQUEST_TIMEOUT_MS=4500`, but then treats an attempt as “≤4.5s incl. ready-wait.” Implementation performs them sequentially (`src/main/whisper/transcriber.ts:53-64`). The 20s budget may still be adequate based on measured latency, but the stated worst-case proof is not valid. Either enforce one combined per-attempt deadline or recalculate the true upper bound.

3. **Crash threshold wording conflicts.** D3 says “>5 crashes in 60s,” while the risk table/brief describes “5 crashes/60s → unavailable.” The contract should explicitly choose whether the fifth or sixth crash trips the breaker.

4. **The risk table says “startup pkill sweep,” despite D2 explicitly rejecting `pkill`.** That stale wording should say owned-PID validated sweep.

5. **D9 requires modifying a file deliberately ignored and untracked by the repository.** The plan should have identified the `.gitignore`/durability conflict before treating `CLAUDE.md` as a branch deliverable.

