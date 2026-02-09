import React from "react";
import WaveAnimation from "./WaveAnimation";

interface RecordingStateProps {
  mode: "hotkey" | "click";
  onCancel: () => void;
  onStop: () => void;
}

/**
 * Recording State - Wispr style
 * Just: X button | waves | stop button (no mic icon)
 */
export default function RecordingState({
  mode,
  onCancel,
  onStop,
}: RecordingStateProps) {
  if (mode === "hotkey") {
    // Hotkey mode: just waves
    return (
      <div className="widget-recording-hotkey">
        <WaveAnimation isActive={true} />
      </div>
    );
  }

  // Click mode: X | waves | stop button
  return (
    <div className="widget-recording">
      {/* Cancel Button */}
      <button
        className="widget-cancel-btn widget-clickable"
        onClick={onCancel}
        title="Cancel"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Wave Animation */}
      <WaveAnimation isActive={true} />

      {/* Stop Button */}
      <button
        className="widget-stop-btn widget-clickable"
        onClick={onStop}
        title="Stop & Paste"
      />
    </div>
  );
}
