# 🎙️ StayFree

**Hold a key, speak in English or Hinglish, release — your text appears instantly in whatever app you're using.**

[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](https://apple.com)
[![Electron](https://img.shields.io/badge/Framework-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Local-first ASR](https://img.shields.io/badge/Speech%20AI-whisper.cpp%20(local)-blue)](https://github.com/ggml-org/whisper.cpp)

StayFree is a lightweight, macOS-only menu bar dictation app. Whenever you want to type — whether in VS Code, Slack, WhatsApp, Terminal, or Notes — just press and hold the hotkey (`Option` key), speak naturally, and release. The raw transcript auto-pastes directly into your focused field.

Transcription runs entirely on your Mac via a local `whisper.cpp` engine (Metal-accelerated) — works fully offline.

---

## ✨ Features

- 🔒 **Local-First Transcription**: Audio is transcribed on-device by a local `whisper.cpp` server (Metal-accelerated, a warm background process).
- 🗣️ **English & Hinglish Support**: A Hinglish-tuned `whisper.cpp` model (Oriserve Swift, q8_0 quantized) transcribes both languages to Roman-script text.
- 🎯 **Works System-Wide**: Pastes directly into whichever text input field is currently active (VS Code, Cursor, Slack, WhatsApp, Terminal, Browser, etc.).
- 🎈 **Floating Dock Widget**: Minimalist floating overlay near the dock providing real-time visual feedback (`Recording` / `Processing` / `Error`).
- 📡 **Works Offline**: No internet connection required — the entire pipeline runs locally.

---

## 📋 What You Need

1. **Operating System**: macOS (Apple Silicon recommended — the local ASR engine uses Metal).
2. **Node.js**: v18 or higher & `npm`.
3. **~150MB of disk space** for the local whisper.cpp binary + model (installed outside the repo, in your user Application Support folder).

---

## 🚀 Quick Setup

Follow these steps to get StayFree running on your machine:

```bash
# 1. Clone the repository
git clone https://github.com/Adityalingwal/Stayfree.git
cd Stayfree

# 2. Install dependencies
npm install

# 3. Install the local whisper.cpp engine (binary + model)
./scripts/setup-whisper.sh
```

`setup-whisper.sh` installs the whisper.cpp engine + model into
`~/Library/Application Support/StayFree/whisper/` and runs a quick smoke test.

Then start the app:
```bash
npm start
```

If the whisper engine assets are missing or broken, the app still starts —
the first dictation attempt will show an actionable error instead of
silently failing.

---

## 🔐 First Launch & Permissions

When you run `npm start` for the first time:

1. An onboarding window will appear asking for the required permissions:
   - **Microphone**: Click **Allow** to enable voice recording.
   - **Accessibility**: Click **Open Settings** and enable **Electron** under Accessibility.
2. Once the required permissions show **Granted**, click **Start using StayFree**. The app will continue running in your system tray / menu bar.

---

## ⌨️ How to Use

| Action | Shortcut / Trigger |
|---|---|
| Push-to-Talk Dictation | Press & hold **`Left-Option`** key, speak, release |
| Re-paste Last Transcript | `Cmd + Shift + V` |
| Open Settings UI | Click Menu Bar Tray Icon ➔ `Settings` |
