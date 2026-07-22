# 🎙️ StayFree

**Hold a key, speak in English or Hinglish, release — your text appears instantly in whatever app you're using.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: macOS / Windows](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey.svg)](https://apple.com)
[![Electron](https://img.shields.io/badge/Framework-Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Sarvam AI](https://img.shields.io/badge/Speech%20AI-Sarvam%20Saaras%20v3-blue)](https://www.sarvam.ai/)

StayFree is a lightweight menu bar dictation app. Whenever you want to type — whether in VS Code, Slack, WhatsApp, Terminal, or Notes — just press and hold the hotkey (`Option` key on Mac / `Ctrl + Win` on Windows), speak naturally, and release. The raw transcript auto-pastes directly into your focused field within **200–500ms**.

```
┌────────────────────────────────────────────────────────┐
│  🎙️  Hold Hotkey (Mac: Left-Option | Win: Ctrl+Win)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  ⚡  Live PCM16 Audio Stream to Sarvam AI (Saaras v3)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  🖐️  Release Key                                       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  ✨  Instant Auto-Paste (Cmd+V / Ctrl+V into active app)│
└────────────────────────────────────────────────────────┘
```

---

## ✨ Features

- ⚡ **Ultra-Fast Dictation**: Audio streams live over WebSocket (PCM16 @ 16kHz) to Sarvam AI while you speak. Response time is just 200–500ms after key release.
- 🗣️ **English & Hinglish Support**: Uses Sarvam's `Saaras v3` model with `translit` mode to produce crisp Roman script text for both Hinglish and English.
- 🎯 **Works System-Wide**: Pastes directly into whichever text input field is currently active (VS Code, Cursor, Slack, WhatsApp, Terminal, Browser, etc.).
- 🎈 **Floating Dock Widget**: Minimalist floating overlay near the dock providing real-time visual feedback (`Recording` / `Processing`).

---

## 📋 What You Need

1. **Operating System**: macOS (Intel / Apple Silicon) or Windows.
2. **Node.js**: v18 or higher & `npm`.
3. **Sarvam AI API Key**: Get a free API key at [Sarvam AI Portal](https://www.sarvam.ai/).

---

## 🚀 Quick Setup

Follow these steps to get StayFree running on your machine:

```bash
# 1. Clone the repository
git clone https://github.com/Adityalingwal/Stayfree.git
cd Stayfree

# 2. Install dependencies
npm install

# 3. Create your .env file
cp .env.example .env
```

Open `.env` in your editor and paste your Sarvam API Key:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
```

Then start the app:
```bash
npm start
```

---

## 🔐 First Launch & Permissions

When you run `npm start` for the first time:

1. **Automatic Onboarding Screen**: An Onboarding window will automatically appear asking for required permissions:
   - **Microphone**: Click **Grant** to allow voice recording.
   - **Accessibility** *(macOS only)*: Click **Open Settings** to allow hotkey detection and automated text pasting.
2. Once permissions are granted, StayFree runs silently in your system tray / menu bar.

---

## ⌨️ How to Use

| Platform | Action | Shortcut / Trigger |
|---|---|---|
| **macOS** | Push-to-Talk Dictation | Press & hold **`Left-Option`** (Alt) key, speak, release |
| **Windows** | Push-to-Talk Dictation | Press & hold **`Ctrl + Win`** key, speak, release |
| **Both** | Re-paste Last Transcript | `Ctrl + Cmd + V` (Mac) / `Ctrl + Shift + V` (Win) |
| **Both** | Open Settings UI | Click Menu Bar Tray Icon ➔ `Settings` |

---

## 🔒 Privacy & Local State

- **Local & ENV Config**: Your API key can be set in `.env` or saved locally via the app settings dashboard.
- **Direct Streaming**: Audio streams directly from your device to Sarvam AI's WebSocket endpoint. No third-party proxy servers used.

---

## 📄 License

MIT © [Aditya Lingwal](https://github.com/Adityalingwal) — see [LICENSE](LICENSE).
