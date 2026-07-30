import { contextBridge, ipcRenderer } from "electron";

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

type WidgetUiState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "processing"
  | "error";

/** Typed widget-state IPC payload (D1) — replaces the old bare-string channel. */
type WidgetStatePayload = {
  state: WidgetUiState;
  message?: string;
  pipelineId?: number | null;
};

/**
 * Preload script - exposes safe IPC APIs to renderer process
 *
 * Shared across all windows (recorder, onboarding, settings).
 * Each window only uses the methods it needs.
 */

contextBridge.exposeInMainWorld("electron", {
  // --- Recorder (hidden window) ---
  onStartRecording: (callback: (hindiMode: boolean, sessionId: string) => void) => {
    ipcRenderer.on("start-recording", (_event, hindiMode: boolean, sessionId: string) => callback(hindiMode, sessionId));
  },
  onStopRecording: (callback: (sessionId: string) => void) => {
    ipcRenderer.on("stop-recording", (_event, sessionId: string) => callback(sessionId));
  },
  onCancelRecording: (callback: (sessionId: string) => void) => {
    ipcRenderer.on("cancel-recording", (_event, sessionId: string) => callback(sessionId));
  },
  sendAudioData: (audioBuffer: ArrayBuffer, sessionId: string) => {
    const buffer = Buffer.from(audioBuffer);
    ipcRenderer.send("audio-captured", buffer, sessionId);
  },
  sendAudioChunk: (chunk: ArrayBuffer, sessionId: string) => {
    ipcRenderer.send("audio-chunk-stream", Buffer.from(chunk), sessionId);
  },
  sendAudioStreamStats: (stats: AudioStreamStatsPayload, sessionId: string) => {
    ipcRenderer.send("audio-stream-stats", stats, sessionId);
  },
  sendRecorderStarted: (sessionId: string) => {
    ipcRenderer.send("recorder-started", sessionId);
  },
  sendRecorderError: (sessionId: string, message: string) => {
    ipcRenderer.send("recorder-error", sessionId, message);
  },
  onSelectedMicChanged: (callback: (deviceId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, deviceId: string) =>
      callback(deviceId);
    ipcRenderer.on("selected-mic-changed", handler);
    return () => ipcRenderer.removeListener("selected-mic-changed", handler);
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
    selectedMicId: string;
    soundEnabled: boolean;
  }> => {
    return ipcRenderer.invoke("get-settings");
  },
  saveSelectedMic: (deviceId: string) => {
    ipcRenderer.send("save-selected-mic", deviceId);
  },
  saveSoundEnabled: (enabled: boolean) => {
    ipcRenderer.send("save-sound-enabled", enabled);
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
  // Returns an unsubscribe fn (consistent with onSelectedMicChanged /
  // onWidgetAudioLevel — the widget mounts once, so behavior is unchanged).
  onWidgetState: (
    callback: (
      _event: Electron.IpcRendererEvent,
      payload: WidgetStatePayload,
    ) => void,
  ): (() => void) => {
    ipcRenderer.on("widget-state", callback);
    return () => ipcRenderer.removeListener("widget-state", callback);
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
      onStartRecording: (callback: (hindiMode: boolean, sessionId: string) => void) => void;
      onStopRecording: (callback: (sessionId: string) => void) => void;
      onCancelRecording: (callback: (sessionId: string) => void) => void;
      sendAudioData: (audioBuffer: ArrayBuffer, sessionId: string) => void;
      sendAudioChunk: (chunk: ArrayBuffer, sessionId: string) => void;
      sendAudioStreamStats: (stats: AudioStreamStatsPayload, sessionId: string) => void;
      sendRecorderStarted: (sessionId: string) => void;
      sendRecorderError: (sessionId: string, message: string) => void;
      onSelectedMicChanged: (
        callback: (deviceId: string) => void,
      ) => () => void;
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
        selectedMicId: string;
        soundEnabled: boolean;
      }>;
      saveSelectedMic: (deviceId: string) => void;
      saveSoundEnabled: (enabled: boolean) => void;
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
          payload: WidgetStatePayload,
        ) => void,
      ) => () => void;
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
