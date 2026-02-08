# StayFree - Voice Dictation MVP Implementation Plan

## Overview

Build a Wispr Flow competitor: an Electron + TypeScript macOS app where user holds the **Fn key** to record speech, releases to get formatted text auto-pasted into any active app. Uses **Groq API** (Whisper large-v3-turbo for STT + Llama for formatting).

---

## Decisions

- **STT**: Groq API with `whisper-large-v3-turbo` model (fast, matches PDF spec)
- **Formatting**: Groq API with `llama-3.1-8b-instant` (matches PDF spec, one API key for everything)
- **Hotkey**: Fn key (push-to-talk). Onboarding will instruct users to set macOS Fn key to "Do Nothing" in System Settings
- **Platform**: macOS first
- **Paste**: Clipboard save -> write text -> osascript Cmd+V -> restore clipboard

---

## Project Structure

```
StayFree/
├── package.json
├── tsconfig.json
├── forge.config.ts              # Electron Forge config
├── webpack.main.config.ts       # Webpack config for main process
├── webpack.renderer.config.ts   # Webpack config for renderer
├── webpack.rules.ts
├── webpack.plugins.ts
├── src/
│   ├── main/
│   │   ├── index.ts             # App entry: lifecycle, tray, windows, IPC setup
│   │   ├── hotkey.ts            # Push-to-talk via uiohook-napi (Fn keydown/keyup)
│   │   ├── transcription.ts     # Groq Whisper API calls
│   │   ├── formatting.ts        # Groq Llama 3.1 8B formatting calls
│   │   ├── paste.ts             # Clipboard save/restore + Cmd+V simulation via osascript
│   │   ├── dictionary.ts        # Custom dictionary find/replace
│   │   ├── voice-commands.ts    # "new line", "new paragraph" processing
│   │   ├── ipc-handlers.ts      # IPC handlers: orchestrates the full pipeline
│   │   └── store.ts             # Settings persistence (electron-store)
│   ├── renderer/
│   │   ├── index.html           # Hidden recorder window HTML
│   │   ├── recorder.ts          # MediaRecorder mic capture + IPC bridge
│   │   ├── settings.html        # Settings window HTML
│   │   ├── settings.ts          # Settings UI logic
│   │   └── styles.css           # Settings UI styling
│   └── preload/
│       └── index.ts             # Preload: expose IPC APIs to renderer
├── assets/
│   ├── trayTemplate.png         # Tray icon - idle (16x16 macOS template)
│   ├── trayTemplate@2x.png      # Tray icon - idle (32x32 retina)
│   ├── tray-recording.png       # Tray icon - recording state
│   ├── tray-recording@2x.png
│   ├── tray-processing.png      # Tray icon - processing state
│   └── tray-processing@2x.png
└── .env                         # GROQ_API_KEY (gitignored)
```

---

## Key Dependencies

| Package               | Role                                                 |
| --------------------- | ---------------------------------------------------- |
| `electron` (~v33)     | Desktop app framework                                |
| `@electron-forge/cli` | Build tooling, packaging, dev server                 |
| `typescript`          | Type safety                                          |
| `uiohook-napi`        | Global keydown/keyup detection for Fn push-to-talk   |
| `electron-store`      | Persist settings (hotkey, API key, dictionary)       |
| `groq-sdk`            | Groq API SDK (OpenAI-compatible) for Whisper + Llama |

No other heavy native modules. `osascript` (built into macOS) handles paste simulation.

---

## Implementation Phases

### Phase 1: Project Scaffold + Tray Icon

**Goal:** Electron app that lives in system tray with a menu

1. `npx create-electron-app StayFree --template=typescript-webpack`
2. Configure for tray-only app (no main window, `app.dock.hide()`)
3. `src/main/index.ts`: create Tray with context menu (Settings, Paste Last, Quit)
4. Create simple tray icon PNGs (can be colored circles initially)
5. **Verify:** `npm start` -> app launches, tray icon visible, menu works, no dock icon

### Phase 2: Global Hotkey (Push-to-Talk with Fn Key)

**Goal:** Hold Fn to enter recording state, release to stop

1. `src/main/hotkey.ts`:
   - Init `uiohook-napi`, listen for keydown/keyup
   - Fn key detection (keycode for Fn)
   - Emit events: `recording-start` on Fn down, `recording-stop` on Fn up
   - Key-repeat guard (ignore repeated keydown while already recording)
   - **Fallback**: If Fn detection fails, fall back to `Ctrl+Shift` combo
2. Wire hotkey events to tray icon state changes
3. **Verify:** Hold Fn, tray icon changes to recording state. Release, changes back.

### Phase 3: Audio Capture

**Goal:** Record microphone audio while Fn is held

1. Create hidden `BrowserWindow` (offscreen, for Web Audio API access)
2. `src/preload/index.ts`: expose IPC via `contextBridge`
3. `src/renderer/recorder.ts`:
   - `getUserMedia({ audio: true })` for mic access
   - `MediaRecorder` with `audio/webm;codecs=opus`
   - On `start-recording` IPC -> `mediaRecorder.start()`
   - On `stop-recording` IPC -> `mediaRecorder.stop()`, collect chunks into blob
   - Send blob as `ArrayBuffer` to main process via IPC
4. `src/renderer/index.html`: minimal HTML loading recorder script
5. **Verify:** Hold Fn, speak, release. Audio ArrayBuffer logged in main process. Save to .webm file, verify playback.

### Phase 4: STT via Groq (Whisper large-v3-turbo)

**Goal:** Send recorded audio to Groq Whisper API, get transcript

1. `src/main/store.ts`:
   - `electron-store` with schema: `{ groqApiKey, hotkey, dictionary, lastTranscript }`
2. `src/main/transcription.ts`:
   - `transcribe(audioBuffer: Buffer): Promise<string>`
   - Use `groq-sdk`: `groq.audio.transcriptions.create({ model: 'whisper-large-v3-turbo', file: audioBuffer })`
   - Return raw text
3. **Verify:** Speak a sentence, see raw transcript in console.

### Phase 5: LLM Formatting via Groq (Llama 3.1 8B)

**Goal:** Clean up raw transcript

1. `src/main/formatting.ts`:
   - `formatText(rawText: string): Promise<string>`
   - Groq chat completion with `llama-3.1-8b-instant`
   - System prompt includes ALL formatting instructions:
     - Add punctuation and proper casing
     - Remove filler words (um, uh, like, you know)
     - Handle voice commands in prompt (e.g., "new line" → `\n`, "new paragraph" → `\n\n`)
     - Return ONLY the formatted text
   - Temperature: 0.1
   - **NOTE:** No separate `voice-commands.ts` needed - LLM handles everything via prompt
2. `src/main/dictionary.ts`:
   - Post-formatting: apply user's find/replace rules from store
   - Custom word replacements (e.g., "stayfree" → "StayFree")
3. **Verify:** Speak messy sentences with "um", "uh", "new line". Verify clean formatted output.

### Phase 6: Clipboard + Auto-Paste

**Goal:** Paste formatted text into the active app

1. `src/main/paste.ts`:
   - `saveClipboard()`: read `clipboard.readText()` + `clipboard.readImage()`
   - `writeToClipboard(text)`: `clipboard.writeText(text)`
   - `simulatePaste()`: `exec('osascript -e \'tell application "System Events" to keystroke "v" using command down\'')`
   - `restoreClipboard()`: restore after 150ms delay
   - `pasteText(text)`: orchestrate full sequence, store as lastTranscript
2. Register fallback hotkey `Ctrl+Cmd+V` via `globalShortcut` -> paste lastTranscript
3. On failure: `new Notification({ title: 'StayFree', body: 'Paste failed. Press Ctrl+Cmd+V to paste manually.' })`
4. **Verify:** Dictate in Notes.app, VS Code, Chrome textarea. Text appears. Test clipboard preservation. Test fallback hotkey.

### Phase 7: Full Pipeline Wiring

**Goal:** Wire everything end-to-end with timing

1. `src/main/ipc-handlers.ts`:
   - On `audio-captured` event: run full pipeline
   - Pipeline: audio -> `transcribe()` -> `formatText()` -> `applyDictionary()` -> `pasteText()`
   - Timing: log `L_asr`, `L_llm`, `L_paste`, `L_total` to console
   - Update tray icon: idle -> recording -> processing -> idle
   - Catch errors, show notification, reset tray to idle
2. **Verify:** Full end-to-end: hold Fn, speak, release, text appears in active app. Check timing logs.

### Phase 8: Settings UI

**Goal:** User can configure the app

1. `src/renderer/settings.html` + `settings.ts` + `styles.css`:
   - Groq API key input (with show/hide toggle)
   - Hotkey configuration (record new key combo)
   - Microphone selection dropdown
   - Custom dictionary: editable table (term -> replacement)
   - macOS Fn key setup instructions
2. Settings window opened from tray menu (new `BrowserWindow`)
3. All settings persisted via `electron-store`
4. **Verify:** Change API key, restart, persists. Add dictionary entry, verify it applies.

### Phase 9: Permission Onboarding

**Goal:** Guide user through macOS permissions on first launch

1. Check `systemPreferences.getMediaAccessStatus('microphone')`
2. Check Accessibility permission (needed for osascript paste)
3. Show dialog with:
   - Why permissions are needed
   - Button to open System Settings > Privacy > Accessibility
   - Instructions to set Fn key to "Do Nothing" in System Settings > Keyboard
4. **Verify:** On first run, permission flow guides user correctly.

---

## IPC Communication Design

```
Main Process                          Renderer (Hidden Window)
     |                                        |
     |-- 'start-recording' ----------------->|  (Fn key pressed)
     |                                        |  MediaRecorder.start()
     |                                        |
     |-- 'stop-recording' ------------------>|  (Fn key released)
     |                                        |  MediaRecorder.stop()
     |                                        |
     |<-- 'audio-captured' (ArrayBuffer) ----|  (blob ready)
     |                                        |
     |  [transcribe -> format -> paste]       |
     |                                        |
     |-- 'recording-state' (state) --------->|  (for any UI updates)
```

---

## Verification Checklist (End-to-End)

- [ ] App launches in tray, no dock icon
- [ ] Hold Fn: tray shows recording state, mic captures audio
- [ ] Release Fn: tray shows processing, Groq Whisper API called
- [ ] Formatted text auto-pasted into active app (Notes, VS Code, Chrome textarea)
- [ ] Clipboard is preserved (copy text, dictate, verify original paste works)
- [ ] Fallback hotkey (Ctrl+Cmd+V) pastes last transcript
- [ ] Settings window opens from tray menu, Groq API key saves and persists
- [ ] Custom dictionary replacements work
- [ ] Saying "new line" produces actual newline in output
- [ ] Permission prompts shown on first launch
- [ ] Timing logs show < 2s total latency on good network
- [ ] App stable for 10+ minutes of repeated use
