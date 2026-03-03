# StayFree — Architecture & Repository Decisions

## Repository Structure

### Decision: One repo for Mac + Windows (and future platforms)

**Verdict: Monorepo for all desktop platforms. Always.**

Every major Electron app does this — VS Code, Signal, Discord, 1Password, Figma.
Mac and Windows share ~95% of code. Platform differences are ~40 lines total.
Splitting into separate repos = duplicating thousands of lines for zero benefit.

### Platform differences — how handled

All platform-specific behavior lives in ONE file: `src/main/platform.ts`

```
src/main/platform.ts    ← isMac, isWindows, holdKeyLabel, shortcuts
src/main/hotkey.ts      ← uses platform.ts for default key (Option vs Ctrl+Win)
src/main/paste.ts       ← uses platform.ts for Cmd vs Ctrl
src/index.ts            ← isMac guards for dock, titleBarStyle, accessibility
src/renderer/onboarding.tsx  ← accessibility step hidden on Windows
```

Rule: **Any new platform difference goes in platform.ts first.**

---

## Planned Repository Evolution

### Phase 1 — Now
```
StayFree/               ← Single repo
├── src/                ← Electron app (Mac + Windows)
└── CLAUDE.md
```

### Phase 2 — Backend/ML added
```
StayFree/               ← Still single repo
├── app/                ← Electron (Mac + Windows)
├── server/             ← FastAPI + fine-tuned Whisper + LLaMA inference
└── shared/             ← API types/contracts shared between app and server
```

### Phase 3 — When ML training becomes heavy
```
stayfree/               ← Client monorepo (desktop + maybe mobile later)
stayfree-ml/            ← Separate repo: training pipelines, GPU infra, model registry
                           (split reason: Python/CUDA/PyTorch stack, independent deployment)
```

### Phase 4 — Mobile added
```
stayfree/               ← Monorepo: Electron desktop + React Native mobile
stayfree-ml/            ← ML infra (separate, stays separate)
```

Mobile repo strategy:
- React Native → same monorepo (JS shared with desktop)
- Native Swift/Kotlin → separate repo (different toolchain, no code share)
- Flutter → separate repo (Dart, different build system)

---

## When to Split a Repo

Split only when the pain of staying together exceeds the pain of coordinating across repos.
Most teams split too early. Signs you actually need to split:

- Different deployment cadence (ML deploys independently 10x/day)
- Completely different tech stack (Python GPU training vs TypeScript client)
- Separate team with no overlap
- CI/CD becomes untenable (every PR triggers 45min of unrelated tests)

**NOT a reason to split:** Different OS targets, different UI themes, "cleaner boundaries"

---

## Real-World References

| Company | Desktop structure | Mobile | Backend |
|---------|------------------|--------|---------|
| VS Code | Single repo: Mac+Win+Linux+Web | N/A | N/A |
| Signal | Single repo: Mac+Win+Linux | Separate repos per platform | Separate server repo |
| Discord | Polyglot monorepo: everything | Same monorepo | Same monorepo |
| 1Password | Single repo: Rust core + Electron | Separate | Separate |
| Figma | Monorepo: frontend + backend | N/A | Same monorepo |

Khan Academy lesson: Had separate iOS/Android repos → painful drift →
migrated to mobile monorepo → "well worth it" after one month.

---

## Current Hotkey Design

| Platform | Key | Why |
|----------|-----|-----|
| macOS | Option (Alt) | Reliable keyup, no OS conflicts |
| Windows | Ctrl+Win | Alt keyup intercepted by OS menu bar (WM_SYSKEYUP); Win alone opens Start menu; combo avoids both |

`HotkeyConfig` is intentionally minimal — just `keys: number[]`.
Platform default set in constructor via `isMac ? [UiohookKey.Alt] : [UiohookKey.Ctrl, UiohookKey.Meta]`.

---

## Sarvam Streaming Architecture

See `CLAUDE.md` and `MEMORY.md` for full protocol details.

Key design decision: `flush_signal=true` in URL keeps WS open through VAD silences.
VAD still sends interim segments mid-stream — these are accumulated in `transcriptSegments[]`
and joined on flush response for complete transcript.

Per-recording lifecycle:
```
warmSarvamConnection() → connect() → markRecordingStart() → sendChunk()s → flush() → disconnect() → warmSarvamConnection()
```

Connection is closed after each recording because Sarvam's WS protocol is session-based
(flush finalizes the session). Own server in future = permanent connection, no disconnect needed.
