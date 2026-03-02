# StayFree Windows Readiness - Phase A Handoff

This document summarizes all changes made for Windows baseline readiness so another agent/engineer can continue work without re-discovering context.

## Goal

Make app usable on Windows 10/11 without macOS-only crashes and with platform-correct behavior for permissions, shortcuts, paste automation, and UI copy.

## Files Changed (Phase A)

1. `src/main/platform.ts` (new)
- Added centralized platform helpers:
  - `isMac`, `isWindows`
  - `pasteModifierKey`
  - `settingsShortcut`, `quitShortcut`, `fallbackPasteShortcut`
  - `holdKeyLabel`, `pasteShortcutLabel`
- Reason: remove scattered hardcoded mac assumptions and keep behavior consistent.

2. `src/index.ts`
- Replaced hardcoded shortcuts:
  - fallback paste: now `CommandOrControl+Shift+V`
  - settings: `CommandOrControl+,`
  - quit: `CommandOrControl+Q` on mac, `Alt+F4` on Windows.
- Added platform-safe permission handling:
  - `check-permissions` now returns `{ mic, inputAutomation, platform }`
  - guarded `askForMediaAccess` and `isTrustedAccessibilityClient` behind mac checks.
- Added Windows behavior for permission/open-settings actions (using `ms-settings:` URIs).
- Fixed `get-settings` payload to include missing keys:
  - `sarvamApiKey`, `languagePreference` (renderer expected these already).
- Made mac-only window chrome conditional:
  - `titleBarStyle: "hiddenInset"` and `trafficLightPosition` only on macOS.
- Updated tray tooltips and paste-failure logging to platform-aware labels.
- Reason: avoid Windows runtime breakage from mac-only APIs and fix IPC contract mismatch.

3. `src/main/hotkey.ts`
- Platform-driven default hold key via `UiohookKey.Alt` (no raw magic number literals).
- Logging updated to show Option (mac) vs Alt (Windows).
- Reason: reliable cross-platform default hotkey behavior.

4. `src/main/paste.ts`
- Paste simulation now uses:
  - macOS: `Cmd+V` (`Key.LeftCmd + V`)
  - Windows: `Ctrl+V` (`Key.LeftControl + V`)
- Guarded accessibility prompt logic to only run on macOS.
- Paste failure notification message now platform-aware.
- Reason: previous code always used Cmd-based automation.

5. `src/preload.ts`
- Updated IPC type contract for `checkPermissions` to:
  - `mic`
  - `inputAutomation`
  - `platform`
- Reason: keep renderer typings aligned with main-process response.

6. `src/renderer/onboarding.tsx`
- Onboarding permission model updated:
  - macOS requires mic + input automation
  - Windows requires mic (no mac accessibility gating).
- Copy made platform-aware:
  - macOS/Windows labels and paste shortcut text.
- Kept mac-only accessibility UI block conditional.
- Reason: UI previously hardcoded mac-only guidance.

7. `src/renderer/settings/pages/SettingsPage.tsx`
- Added platform detection using `checkPermissions`.
- About section now shows dynamic platform and hotkey labels.
- Reason: remove static `"macOS"` and mac-only hotkey display.

8. `src/renderer/settings/pages/HomePage.tsx`
- Added platform detection.
- Updated instructional copy from fixed Fn wording to platform-aware hold key label.
- Removed non-null assertion pattern in grouping helper.
- Reason: cross-platform UX consistency + lint hygiene.

9. `src/renderer/settings/App.tsx`
- Used `version` state in header (previously unused).
- Reason: clear lint warning.

10. `src/renderer/recorder.ts`
- Removed non-null assertion and added explicit stream guard.
- Replaced empty catch with warning log.
- Reason: lint compliance and safer runtime.

11. `src/renderer/recorder.worklet.ts`
- Added explicit ambient declarations for worklet globals/types (`AudioWorkletProcessor`, `sampleRate`, `registerProcessor`).
- Removed `@ts-nocheck`.
- Reason: packaging compile was failing in strict TS check during forge webpack build.

12. `src/main/transcription-sarvam.ts`
- Replaced `require("os")` with `import * as os from "os"`.
- Reason: lint fix (`no-var-requires`).

13. `src/main/transcription-sarvam-stream.ts`
- Removed unnecessary explicit type annotations (`no-inferrable-types`).
- Reason: lint fix.

14. `webpack.main.config.ts`
- Removed unused `path` import.
- Reason: lint fix.

## Behavior/API Changes

### `check-permissions` IPC response (changed)
Now returns:

```ts
{
  mic: "not-determined" | "granted" | "denied" | "restricted" | "unknown",
  inputAutomation: boolean | null,
  platform: "darwin" | "win32" | "linux"
}
```

### `get-settings` IPC response (fixed)
Now includes:

```ts
{
  groqApiKey,
  sarvamApiKey,
  languagePreference,
  selectedMicId,
  soundEnabled,
  dictionary
}
```

## Validation Done

1. `npm run lint` -> Passed.
2. `npm run package -- --platform=win32 --arch=x64`:
- Webpack/type compilation now passes.
- Final packaging still fails in this environment due network DNS restriction:
  - `getaddrinfo ENOTFOUND github.com`

This is infra/network-related in current sandbox, not the code-level compile path.

## Important Notes for Next Agent

1. App is now materially closer to Windows baseline, but should still be tested on real Windows 10/11 machines for:
- global hotkey behavior,
- permission UX,
- tray/window behavior,
- paste automation reliability in common apps (browser, editor, office apps).

2. Remaining planned work (Phase B, not implemented here):
- hotkey customization UI + per-platform defaults,
- richer Windows permission diagnostics,
- startup/login behavior options,
- release/signing docs and distribution pipeline hardening.

3. Recommended immediate next command in a network-enabled environment:

```bash
npm run package -- --platform=win32 --arch=x64
```

Then smoke-test generated build on Windows 10 and Windows 11.

