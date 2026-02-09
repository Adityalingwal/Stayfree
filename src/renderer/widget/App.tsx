import React, { useState, useEffect } from "react";
import IdleState from "./components/IdleState";
import RecordingState from "./components/RecordingState";
import ProcessingState from "./components/ProcessingState";

type WidgetState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "processing";

/**
 * Floating Dictation Widget - Wispr Flow style
 *
 * 3 Main States (no hover):
 * 1. IDLE - Small mic icon
 * 2. RECORDING - Mic on top, controls below
 * 3. PROCESSING - Spinner only
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");

  useEffect(() => {
    // Listen for state changes from main process
    window.electron.onWidgetState((_event, newState) => {
      setState(newState);
    });
  }, []);

  // Handle click: start recording in "click" mode (with buttons)
  const handleClick = () => {
    if (state === "idle") {
      window.electron.startWidgetRecording();
    }
  };

  // Handle cancel: discard recording, go back to idle
  const handleCancel = () => {
    if (state === "recording-click") {
      window.electron.cancelWidgetRecording();
    }
  };

  // Handle stop: stop recording, start processing
  const handleStop = () => {
    if (state === "recording-click") {
      window.electron.stopWidgetRecording();
    }
  };

  return (
    <div className="widget-container">
      {state === "idle" && <IdleState onClick={handleClick} />}

      {(state === "recording-hotkey" || state === "recording-click") && (
        <RecordingState
          mode={state === "recording-hotkey" ? "hotkey" : "click"}
          onCancel={handleCancel}
          onStop={handleStop}
        />
      )}

      {state === "processing" && <ProcessingState />}
    </div>
  );
}
