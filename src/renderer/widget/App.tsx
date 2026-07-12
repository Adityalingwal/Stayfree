import React, { useState, useEffect } from "react";
import Waveform from "./components/Waveform";
import ProcessingIndicator from "./components/ProcessingIndicator";

type WidgetState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "processing";

/**
 * Floating Dictation Widget — Wispr Flow style.
 *
 * The native window is a fixed size and NEVER resizes. Every visual change
 * between states happens here in CSS on a single persistent ".widget-pill"
 * shell, so the pill morphs smoothly (grow → record → process → shrink) with no
 * native-frame animation glitch.
 *
 * Look (matched to the reference):
 *  - pill: pitch-black fill, thin outline, full rounded stadium
 *  - idle: tiny thin oval with a visible white outline
 *  - recording: white bars pulsing in sync + a language badge ("HI"/"EN")
 *    floating to the left of the pill (fades out on its own after ~1.6s)
 *  - processing: the SAME waveform bars stay mounted and collapse to dim grey
 *    dots (via CSS) while a lavender multi-spoke spinner fades in at the right
 *
 * The window is much larger than the pill and click-through by default; we make
 * it interactive only while the cursor is over the pill's hit area.
 * Errors are shown in a separate overlay window (#error hash).
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");

  useEffect(() => {
    window.electron.onWidgetState((_event, newState) => {
      setState(newState);
    });
  }, []);

  // The inner content (waveform / buttons / spinner) lingers for a beat while
  // the pill shrinks back to idle, so it can fade out gracefully instead of
  // vanishing and letting the bars snap to the top-left corner. `showInner`
  // keeps it mounted; `innerExiting` triggers the fast opacity fade.
  const [showInner, setShowInner] = useState(false);
  const [innerExiting, setInnerExiting] = useState(false);

  useEffect(() => {
    const active =
      state === "recording-hotkey" ||
      state === "recording-click" ||
      state === "processing";

    if (active) {
      setShowInner(true);
      setInnerExiting(false);
      return;
    }

    // Going idle: play the exit fade, then unmount once it's finished (~120ms,
    // safely longer than the 0.1s fade and clear of the pill's shrink).
    setInnerExiting(true);
    const timer = setTimeout(() => {
      setShowInner(false);
      setInnerExiting(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [state]);

  // Start recording by clicking the idle bar (adds cancel/stop buttons).
  const handleClick = () => {
    if (state === "idle") {
      window.electron.startWidgetRecording();
    }
  };

  const handleCancel = () => {
    if (state === "recording-click") {
      window.electron.cancelWidgetRecording();
    }
  };

  const handleStop = () => {
    if (state === "recording-click") {
      window.electron.stopWidgetRecording();
    }
  };

  // The native window is click-through by default (see index.ts). Make it
  // interactive only while the cursor is actually over the pill hit area, then
  // release it again so clicks pass through everywhere else.
  const handleMouseEnter = () => window.electron.setWidgetIgnoreMouse(false);
  const handleMouseLeave = () => window.electron.setWidgetIgnoreMouse(true);

  return (
    <div className="widget-root">
      <div
        className="widget-hit"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="widget-stage">
          <div
            className={`widget-pill pill-${state}${
              state === "idle" ? " widget-clickable" : ""
            }`}
            onClick={handleClick}
          >
            {/* ONE persistent content block across recording → processing so the
                Waveform never remounts: its bars morph into the processing dots
                purely via CSS. */}
            {showInner && (
              <div
                className={`pill-content pill-content-recording${
                  innerExiting ? " pill-content-exit" : ""
                }`}
              >
                {state === "recording-click" && (
                  <button
                    className="widget-cancel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancel();
                    }}
                    aria-label="Cancel"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1 1L7 7M7 1L1 7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}

                <Waveform />

                {state === "processing" && <ProcessingIndicator />}

                {state === "recording-click" && (
                  <button
                    className="widget-stop-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStop();
                    }}
                    aria-label="Stop"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
