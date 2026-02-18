# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload, opens Electron)
npm start

# Type-check the build (preferred over tsc --noEmit which fails with @types/node)
npm run package

# Lint
npm run lint

# Distribute
npm run make
```

> `npx tsc --noEmit` is broken due to `@types/node` compatibility — use `npm run package` to verify TypeScript compilation.

> If port 9000 is stuck: `pkill -f electron; lsof -ti:9000 | xargs kill -9`

## Architecture

### Process Model
This is a macOS-only Electron tray app (no dock icon). Three Electron BrowserWindows share a **single webpack entry point** (`src/renderer.ts`) and a **single preload** (`src/preload.ts`). The window's purpose is determined by URL hash at load time:

| Hash | Window | Purpose |
|------|--------|---------|
| *(none)* | Recorder | Hidden, always running, owns `MediaRecorder` for audio capture |
| `#onboarding` | Onboarding | First-launch permissions wizard |
| `#settings` | Settings | Full dashboard (React, 1400×900) |
| `#widget` | Widget | Floating always-on-top overlay near the dock |

### Pipeline (main process, `src/index.ts`)
1. **Hotkey** (`src/main/hotkey.ts`) — `uiohook-napi` detects Fn/Left-Option press via `HotkeyManager` singleton; emits `recording-start` / `recording-stop`
2. **Recording** — Main sends `start-recording` IPC to hidden recorder window; renderer captures with `MediaRecorder` and sends back `audio-captured` with a `Buffer`
3. **Transcription** (`src/main/transcription.ts`) — Routes to Groq Whisper (English) or Sarvam Saaras v3 (Hindi/Hinglish) based on `languagePreference` store key
4. **Formatting** (`src/main/formatting.ts`) — Groq Llama 3.1 8B cleans up transcript (English only; Hindi skips this step)
5. **Paste** (`src/main/paste.ts`) — `@nut-tree-fork/nut-js` simulates Cmd+V; fallback hotkey Ctrl+Cmd+V re-pastes last transcript

An `isProcessing` boolean guards against concurrent pipeline runs. A `finally` block always resets state and returns tray/widget to idle.

### State
- `AppState`: `"idle" | "recording" | "processing"` — drives tray tooltip
- `WidgetUiState`: `"idle" | "recording-hotkey" | "recording-click" | "processing"` — drives widget appearance
- `RecordingSource`: `"hotkey" | "widget" | null` — prevents cross-source conflicts

### Persistence (`src/main/store.ts`)
`electron-store` singleton. Key fields: `groqApiKey`, `sarvamApiKey`, `languagePreference`, `dictionary`, `lastTranscript`, `transcriptionHistory` (capped at 100), `onboardingComplete`, `selectedMicId`, `soundEnabled`.

### IPC Pattern
- `ipcMain.handle` → `ipcRenderer.invoke` for calls that return values
- `ipcMain.on` → `ipcRenderer.send` for fire-and-forget
- All renderer-accessible APIs are declared in `src/preload.ts` under `window.electron`

## Webpack Notes
- `uiohook-napi` must stay in `externals` in `webpack.main.config.ts` — it's a native module and cannot be bundled
- Assets (`src/assets/`) are copied to `.webpack/main/assets/` via `CopyWebpackPlugin`
- CSS pipeline (renderer only): `style-loader → css-loader → postcss-loader`
- Tailwind v4: uses `@import "tailwindcss"` in CSS (not v3 `@tailwind` directives); no `tailwind.config.js` needed; plugin is `@tailwindcss/postcss`
- `tsconfig.json` has `"jsx": "react-jsx"` for React support

## Settings UI (`src/renderer/settings/`)
React app with a sidebar layout (`App.tsx`). Three pages: `HomePage`, `DictionaryPage`, `SettingsPage`. Accessed via tray click or `Cmd+,`.

## Widget (`src/renderer/widget/`)
Frameless, transparent, always-on-top window pinned 8px above the dock. Resizes between layouts (`idle` 60×16, `recording` 120×34, `processing` 60×24) via `widgetWindow.setBounds()`.
