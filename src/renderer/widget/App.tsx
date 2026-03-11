import React, { useState, useEffect } from "react";
import IdleState from "./components/IdleState";
import RecordingState from "./components/RecordingState";
import ProcessingState from "./components/ProcessingState";

type WidgetState = "idle" | "recording-hotkey" | "recording-click" | "recording-command" | "processing";

/**
 * Floating Dictation Widget - Wispr Flow style
 *
 * States:
 * 1. IDLE - Small bar
 * 2. RECORDING - Mic + waves
 * 3. PROCESSING - Spinner
 *
 * Errors are shown in a separate overlay window (#error hash).
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");

  useEffect(() => {
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

      {(state === "recording-hotkey" || state === "recording-click" || state === "recording-command") && (
        <RecordingState
          mode={state === "recording-hotkey" ? "hotkey" : state === "recording-command" ? "command" : "click"}
          onCancel={handleCancel}
          onStop={handleStop}
        />
      )}

      {state === "processing" && <ProcessingState />}
    </div>
  );
}
