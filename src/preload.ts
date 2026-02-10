import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script - exposes safe IPC APIs to renderer process
 *
 * Shared across all windows (recorder, onboarding, settings).
 * Each window only uses the methods it needs.
 */

contextBridge.exposeInMainWorld("electron", {
  // --- Recorder (hidden window) ---
  onStartRecording: (callback: () => void) => {
    ipcRenderer.on("start-recording", callback);
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

  // --- Onboarding / Permissions ---
  checkPermissions: (): Promise<{ mic: string; accessibility: boolean }> => {
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

  // --- Floating Widget ---
  onWidgetState: (
    callback: (
      _event: Electron.IpcRendererEvent,
      state: "idle" | "recording-hotkey" | "recording-click" | "processing",
    ) => void,
  ) => {
    ipcRenderer.on("widget-state", callback);
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
  setWidgetLayout: (layout: "idle" | "ready" | "recording" | "processing") => {
    ipcRenderer.send("widget-set-layout", layout);
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
      onStartRecording: (callback: () => void) => void;
      onStopRecording: (callback: () => void) => void;
      onCancelRecording: (callback: () => void) => void;
      sendAudioData: (audioBuffer: ArrayBuffer) => void;
      // Onboarding / Permissions
      checkPermissions: () => Promise<{ mic: string; accessibility: boolean }>;
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
      // Floating Widget
      onWidgetState: (
        callback: (
          _event: Electron.IpcRendererEvent,
          state: "idle" | "recording-hotkey" | "recording-click" | "processing",
        ) => void,
      ) => void;
      startWidgetRecording: () => void;
      stopWidgetRecording: () => void;
      cancelWidgetRecording: () => void;
      setWidgetLayout: (
        layout: "idle" | "ready" | "recording" | "processing",
      ) => void;
      openSettingsFromWidget: () => void;
    };
  }
}
