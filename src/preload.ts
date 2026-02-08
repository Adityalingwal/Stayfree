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
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electron: {
      // Recorder
      onStartRecording: (callback: () => void) => void;
      onStopRecording: (callback: () => void) => void;
      sendAudioData: (audioBuffer: ArrayBuffer) => void;
      // Onboarding / Permissions
      checkPermissions: () => Promise<{ mic: string; accessibility: boolean }>;
      requestMicPermission: () => Promise<boolean>;
      openAccessibilitySettings: () => void;
      openKeyboardSettings: () => void;
      completeOnboarding: () => void;
    };
  }
}
