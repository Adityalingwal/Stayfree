# Session Handoff — Local-STT Migration (2026-07-30)

> Ye document nayi session ke liye resume-point hai. Iske saath padho:
> `docs/LOCAL-STT-MIGRATION-PLAN.md` (approved plan), `docs/whisper-preflight-phase0.md`
> (Phase-0 measurements), `docs/LOCAL-FIRST-STT.md` (poora project master doc).

## Kahan tak pahunche (status)

**Implementation COMPLETE + core smoke test PASSED.** Branch `feat/local-stt`,
5 commits (71ee238 → 9473d3b), main untouched, kuch push nahi hua, merge PENDING.

- Sarvam poori tarah removed (code, deps, creds, `.env.example`, onboarding copy)
- Naya engine: `whisper-server` sidecar (Oriserve Swift q8_0 + Metal), dynamic port,
  PID-state-file zombie sweep, always-warm, retry-once-with-restart, widget error pill
- Naye modules: `src/main/whisper/{wav,server,transcriber}.ts`
- Assets: `~/Library/Application Support/StayFree/whisper/` (via `scripts/setup-whisper.sh` —
  rpath patch + codesign zaroori, script karta hai)
- Implementation findings ki full file scratchpad mein thi (session-temporary) — uska
  essence is doc + plan doc + preflight doc mein capture hai

## Aditya ke live smoke test ke results (2026-07-30, real usage)

5 dictations, sab pass:
- **Latency: L_asr 147-274ms, L_total 176-318ms** (20.6s recording → 274ms!) — Sarvam se 2-4x behtar
- Hinglish + English dono sahi, paste 12-25ms, Metal engaged, history rotation sahi
- **RAM measured: whisper-server 113MB** (estimate 200-300MB tha — behtar nikla), Electron 219MB, system 37% free
- Observation (bug nahi): romanization style thodi formal hai (`yah`, `chaahie`, `nahin` vs
  Sarvam ka `yeh`, `chahiye`, `nahi`) — fine-tuning phase mein address hoga

## PENDING: 4 edge-case tests (Aditya khud karega, live mic/UI chahiye)

1. **Silent hold (~3s, kuch mat bolo):** check karo error pill aata hai ya hallucinated
   text (`"Haan."` type) paste hota hai. Ye SHIP-FLAG #1 ka real test hai — measured
   fact: model silence pe fake text de sakta hai, `-sns` flag bhi fix nahi karta.
2. **Kill mid-recording:** recording ke beech `kill -9 $(pgrep whisper-server)` → release →
   logs mein restart+retry dikhe → transcript ya clean error, app idle pe wapas (stuck nahi).
3. **Normal quit:** tray menu → Quit → `pgrep whisper-server` KHALI aana chahiye
   (warna 113MB ka orphan reh jata hai). SIGTERM path verified hai; tray-click path nahi.
4. **Assets missing:** whisper folder ko `mv` karke hatao → dictate → actionable error
   ("run scripts/setup-whisper.sh") dikhna chahiye, crash nahi → folder wapas → recovery check.

## 2 OPEN SHIP-FLAGS (Aditya ka decision, testing ke baad)

1. **Silence hallucination** — unmitigated, measured. Energy-gate FORBIDDEN hai
   (plan mein documented kyun: baseline real first-words ko silence samajh leta hai).
2. **Fresh binary path = ~7.5s one-time Metal shader compile** — setup script pre-warm
   karta hai; sirf future installer design ka concern.

## NEXT STEP (Aditya ne decide kiya): dual code-review, phir merge

Do BACKGROUND review agents spin off karne hai (implementation ka independent review):
- **Ek Claude agent** (background, model Aditya se confirm karna — pichhla default Sonnet 5)
- **Ek GPT/Codex review** (codex CLI available hai is machine pe — fusion plugin use karta hai;
  review ke liye `codex exec` direct chalaya ja sakta hai ya fusion-style relay)

Review scope: branch `feat/local-stt` ka poora diff (`git diff main...feat/local-stt`) —
plan (`docs/LOCAL-STT-MIGRATION-PLAN.md`) ke against: decisions D1-D9 sahi implement hue?
edge cases handle hai? code quality/simplicity/contributor-readability bar meet hoti hai?
koi bug/regression? Dono reviews aane pe findings consolidate karke Aditya ko dikhana,
confirmed issues isi branch pe fix karwana (background agent se, confirm-gate ke baad),
phir Aditya khud merge karega.

## Uske baad ka roadmap (LOCAL-FIRST-STT.md §9)

Streaming layer (phase 2 — custom sidecar, transcribe-while-recording) · data collection
(pseudo-label OFFLINE Sarvam script — app mein Sarvam nahi hai ab; YouTube; augmentation) ·
pilot fine-tune (Colab, ₹0-1k, 75/25 mix) · scale.

## Standing rules (har session)

Hinglish, short/concise, ek-ek karke · background agents (model har baar confirm, default
Sonnet 5) · confirm-gate before implementation · M3 8GB heat-sensitive (heat rating batao) ·
storage discipline (scoped dirs, cleanup, disk before/after) · **git Aditya khud handle
karta hai** (feat/local-stt ke commits us task ke liye specially authorized the) ·
handoff-critical files DURABLE path pe (scratchpad wipe ho chuka hai ek baar) ·
~/stt-testing/ kabhi delete/modify nahi (gold test set + benchmark harness).
