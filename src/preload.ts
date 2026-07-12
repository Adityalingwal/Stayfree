import { contextBridge, ipcRenderer } from "electron";

type WidgetErrorPayload = {
  code: "NO_AUDIO" | "STREAM_TIMEOUT" | "WS_CLOSED" | "SERVER_ERROR";
  message: string;
  action?: "retry";
};

type AudioStreamStatsPayload = {
  chunkCount: number;
  pcmBytes: number;
  avgRms: number;
  maxRms: number;
  baselineRms: number;
  voicedMs: number;
  hasSpeech: boolean;
  isBorderlineSpeech: boolean;
  streamingFailed: boolean;
};

/**
 * Preload script - exposes safe IPC APIs to renderer process
 *
 * Shared across all windows (recorder, onboarding, settings).
 * Each window only uses the methods it needs.
 */

contextBridge.exposeInMainWorld("electron", {
  // --- Recorder (hidden window) ---
  onStartRecording: (callback: (hindiMode: boolean) => void) => {
    ipcRenderer.on("start-recording", (_event, hindiMode: boolean) => callback(hindiMode));
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on("stop-recording", callback);
  },
  onCancelRecording: (callback: () => void) => {
    ipcRenderer.on("cancel-recording", callback);
  },
  sendAudioData: (audioBuffer: ArrayBuffer) => {
    const buffer = Buffer.from(audioBuffer);
    ipcRenderer.send("audio-captured", buffer);
  },
  sendAudioChunk: (chunk: ArrayBuffer) => {
    ipcRenderer.send("audio-chunk-stream", Buffer.from(chunk));
  },
  sendAudioStreamStats: (stats: AudioStreamStatsPayload) => {
    ipcRenderer.send("audio-stream-stats", stats);
  },

  // --- Onboarding / Permissions ---
  checkPermissions: (): Promise<{
    mic: "not-determined" | "granted" | "denied" | "restricted" | "unknown";
    inputAutomation: boolean | null;
    platform: "darwin" | "win32" | "linux";
  }> => {
    return ipcRenderer.invoke("check-permissions");
  },
  requestMicPermission: (): Promise<boolean> => {
    return ipcRenderer.invoke("request-mic-permission");
  },
  openAccessibilitySettings: () => {
    ipcRenderer.send("open-accessibility-settings");
  },
  openKeyboardSettings: () => {
    ipcRenderer.send("open-keyboard-settings");
  },
  completeOnboarding: () => {
    ipcRenderer.send("complete-onboarding");
  },

  // --- Settings / Dashboard ---
  getSettings: (): Promise<{
    groqApiKey: string;
    sarvamApiKey: string; // NEW
    languagePreference: "english" | "hindi"; // NEW
    selectedMicId: string;
    soundEnabled: boolean;
    dictionary: Record<string, string>;
  }> => {
    return ipcRenderer.invoke("get-settings");
  },
  saveApiKey: (key: string): Promise<void> => {
    return ipcRenderer.invoke("save-api-key", key);
  },
  saveSelectedMic: (deviceId: string) => {
    ipcRenderer.send("save-selected-mic", deviceId);
  },
  saveSoundEnabled: (enabled: boolean) => {
    ipcRenderer.send("save-sound-enabled", enabled);
  },
  // NEW: Language preference
  getLanguagePreference: (): Promise<"english" | "hindi"> => {
    return ipcRenderer.invoke("get-language-preference");
  },
  saveLanguagePreference: (pref: "english" | "hindi") => {
    ipcRenderer.send("save-language-preference", pref);
  },
  // NEW: Sarvam API key
  getSarvamApiKey: (): Promise<string> => {
    return ipcRenderer.invoke("get-sarvam-api-key");
  },
  saveSarvamApiKey: (key: string) => {
    ipcRenderer.send("save-sarvam-api-key", key);
  },
  getDictionary: (): Promise<Record<string, string>> => {
    return ipcRenderer.invoke("get-dictionary");
  },
  saveDictionary: (dictionary: Record<string, string>) => {
    ipcRenderer.send("save-dictionary", dictionary);
  },
  getTranscriptionHistory: (): Promise<
    Array<{
      text: string;
      rawText: string;
      timestamp: number;
      durationMs: number;
    }>
  > => {
    return ipcRenderer.invoke("get-transcription-history");
  },
  clearTranscriptionHistory: () => {
    ipcRenderer.send("clear-transcription-history");
  },
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke("get-app-version");
  },

  downloadAudioFile: (filename: string): Promise<boolean> => {
    return ipcRenderer.invoke("download-audio-file", filename);
  },
  onTranscriptionHistoryUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on("transcription-history-updated", handler);
    return () => {
      ipcRenderer.removeListener("transcription-history-updated", handler);
    };
  },

  // --- Floating Widget ---
  onWidgetState: (
    callback: (
      _event: Electron.IpcRendererEvent,
      state:
        | "idle"
        | "recording-hotkey"
        | "recording-click"
        | "processing",
    ) => void,
  ) => {
    ipcRenderer.on("widget-state", callback);
  },
  onErrorMessage: (
    callback: (
      _event: Electron.IpcRendererEvent,
      payload: WidgetErrorPayload | string,
    ) => void,
  ) => {
    ipcRenderer.on("error-message", callback);
  },
  dismissErrorBubble: () => {
    ipcRenderer.send("dismiss-error-bubble");
  },
  startWidgetRecording: () => {
    ipcRenderer.send("widget-start-recording");
  },
  stopWidgetRecording: () => {
    ipcRenderer.send("widget-stop-recording");
  },
  cancelWidgetRecording: () => {
    ipcRenderer.send("widget-cancel-recording");
  },
  setWidgetIgnoreMouse: (ignore: boolean) => {
    ipcRenderer.send("widget-set-ignore-mouse", ignore);
  },
  // Recorder → main: live mic RMS level (0..~1) at ~30fps during recording.
  sendAudioLevel: (level: number) => {
    ipcRenderer.send("audio-level", level);
  },
  // Widget: subscribe to the forwarded mic level. Returns an unsubscribe fn.
  onWidgetAudioLevel: (
    callback: (_event: Electron.IpcRendererEvent, level: number) => void,
  ): (() => void) => {
    ipcRenderer.on("widget-audio-level", callback);
    return () => ipcRenderer.removeListener("widget-audio-level", callback);
  },
  openSettingsFromWidget: () => {
    ipcRenderer.send("widget-open-settings");
  },
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electron: {
      // Recorder
      onStartRecording: (callback: (hindiMode: boolean) => void) => void;
      onStopRecording: (callback: () => void) => void;
      onCancelRecording: (callback: () => void) => void;
      sendAudioData: (audioBuffer: ArrayBuffer) => void;
      sendAudioChunk: (chunk: ArrayBuffer) => void;
      sendAudioStreamStats: (stats: AudioStreamStatsPayload) => void;
      // Onboarding / Permissions
      checkPermissions: () => Promise<{
        mic: "not-determined" | "granted" | "denied" | "restricted" | "unknown";
        inputAutomation: boolean | null;
        platform: "darwin" | "win32" | "linux";
      }>;
      requestMicPermission: () => Promise<boolean>;
      openAccessibilitySettings: () => void;
      openKeyboardSettings: () => void;
      completeOnboarding: () => void;
      // Settings / Dashboard
      getSettings: () => Promise<{
        groqApiKey: string;
        sarvamApiKey: string;
        languagePreference: "english" | "hindi";
        selectedMicId: string;
        soundEnabled: boolean;
        dictionary: Record<string, string>;
      }>;
      saveApiKey: (key: string) => Promise<void>;
      saveSelectedMic: (deviceId: string) => void;
      saveSoundEnabled: (enabled: boolean) => void;
      getLanguagePreference: () => Promise<"english" | "hindi">;
      saveLanguagePreference: (pref: "english" | "hindi") => void;
      getSarvamApiKey: () => Promise<string>;
      saveSarvamApiKey: (key: string) => void;
      getDictionary: () => Promise<Record<string, string>>;
      saveDictionary: (dictionary: Record<string, string>) => void;
      getTranscriptionHistory: () => Promise<
        Array<{
          text: string;
          rawText: string;
          timestamp: number;
          durationMs: number;
        }>
      >;
      clearTranscriptionHistory: () => void;
      getAppVersion: () => Promise<string>;
      downloadAudioFile: (filename: string) => Promise<boolean>;
      onTranscriptionHistoryUpdated: (callback: () => void) => () => void;
      // Floating Widget
      onWidgetState: (
        callback: (
          _event: Electron.IpcRendererEvent,
          state: "idle" | "recording-hotkey" | "recording-click" | "processing",
        ) => void,
      ) => void;
      onErrorMessage: (
        callback: (
          _event: Electron.IpcRendererEvent,
          payload: WidgetErrorPayload | string,
        ) => void,
      ) => void;
      dismissErrorBubble: () => void;
      startWidgetRecording: () => void;
      stopWidgetRecording: () => void;
      cancelWidgetRecording: () => void;
      setWidgetIgnoreMouse: (ignore: boolean) => void;
      sendAudioLevel: (level: number) => void;
      onWidgetAudioLevel: (
        callback: (_event: Electron.IpcRendererEvent, level: number) => void,
      ) => () => void;
      openSettingsFromWidget: () => void;
    };
  }
}
