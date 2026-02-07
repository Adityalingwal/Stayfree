import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script - exposes safe IPC APIs to renderer process
 */

// Expose IPC communication to renderer (secure via contextBridge)
contextBridge.exposeInMainWorld("electron", {
  // Receive commands from main process
  onStartRecording: (callback: () => void) => {
    ipcRenderer.on("start-recording", callback);
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on("stop-recording", callback);
  },

  // Send data to main process
  sendAudioData: (audioBuffer: ArrayBuffer) => {
    // Convert ArrayBuffer to Buffer for IPC
    const buffer = Buffer.from(audioBuffer);
    ipcRenderer.send("audio-captured", buffer);
  },
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electron: {
      onStartRecording: (callback: () => void) => void;
      onStopRecording: (callback: () => void) => void;
      sendAudioData: (audioBuffer: ArrayBuffer) => void;
    };
  }
}
