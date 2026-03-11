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
      state: "idle" | "recording-hotkey" | "recording-click" | "processing",
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
  setWidgetLayout: (layout: "idle" | "recording" | "processing") => {
    ipcRenderer.send("widget-set-layout", layout);
  },
  openSettingsFromWidget: () => {
    ipcRenderer.send("widget-open-settings");
  },

  // --- Notes ---
  getNotes: (): Promise<import("./main/store").Note[]> =>
    ipcRenderer.invoke("get-notes"),
  searchNotes: (query: string): Promise<import("./main/store").Note[]> =>
    ipcRenderer.invoke("search-notes", query),
  createNote: (params: {
    content: string;
    title?: string;
  }): Promise<import("./main/store").Note> =>
    ipcRenderer.invoke("create-note", params),
  updateNote: (
    id: string,
    updates: Record<string, unknown>,
  ): Promise<import("./main/store").Note | null> =>
    ipcRenderer.invoke("update-note", id, updates),
  deleteNote: (id: string): Promise<boolean> =>
    ipcRenderer.invoke("delete-note", id),
  promoteToNote: (entry: {
    text: string;
    rawText: string;
    timestamp: number;
    durationMs: number;
  }): Promise<import("./main/store").Note> =>
    ipcRenderer.invoke("promote-to-note", entry),
  onNotesUpdated: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on("notes-updated", handler);
    return () => ipcRenderer.removeListener("notes-updated", handler);
  },
  onNavigateToTab: (callback: (tab: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, tab: string) =>
      callback(tab);
    ipcRenderer.on("navigate-to-tab", handler);
    return () => ipcRenderer.removeListener("navigate-to-tab", handler);
  },
});

type Note = {
  id: string;
  title: string;
  content: string;
  rawContent: string;
  createdAt: number;
  updatedAt: number;
  source: "voice" | "text" | "clipboard" | "transcription";
  pinned: boolean;
  archived: boolean;
  tags: string[];
};

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
          state: "idle" | "recording-hotkey" | "recording-click" | "recording-command" | "processing",
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
      setWidgetLayout: (
        layout: "idle" | "recording" | "processing",
      ) => void;
      openSettingsFromWidget: () => void;
      // Notes
      getNotes: () => Promise<Note[]>;
      searchNotes: (query: string) => Promise<Note[]>;
      createNote: (params: { content: string; title?: string }) => Promise<Note>;
      updateNote: (id: string, updates: Record<string, unknown>) => Promise<Note | null>;
      deleteNote: (id: string) => Promise<boolean>;
      promoteToNote: (entry: {
        text: string;
        rawText: string;
        timestamp: number;
        durationMs: number;
      }) => Promise<Note>;
      onNotesUpdated: (callback: () => void) => () => void;
      onNavigateToTab: (callback: (tab: string) => void) => () => void;
    };
  }
}
