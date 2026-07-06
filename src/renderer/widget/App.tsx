import React, { useState, useEffect } from "react";
import Waveform from "./components/Waveform";
import ProcessingIndicator from "./components/ProcessingIndicator";
import LangBadge from "./components/LangBadge";

type WidgetState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "recording-command"
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
  const [lang, setLang] = useState<"english" | "hindi">("english");

  useEffect(() => {
    window.electron.onWidgetState((_event, newState) => {
      setState(newState);
      // Refresh the language badge each time recording (re)starts — the user
      // may have switched languages since the last time.
      if (newState.startsWith("recording")) {
        window.electron
          .getLanguagePreference()
          .then(setLang)
          .catch(() => undefined);
      }
    });
  }, []);

  const isRecording =
    state === "recording-hotkey" ||
    state === "recording-click" ||
    state === "recording-command";

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
          {/* Language badge floats to the left of the pill while recording
              (absolutely positioned — it never shifts the pill itself). */}
          {isRecording && state !== "recording-command" && (
            <LangBadge lang={lang} />
          )}

          <div
            className={`widget-pill pill-${state}${
              state === "idle" ? " widget-clickable" : ""
            }`}
            onClick={handleClick}
          >
            {/* ONE persistent content block across recording → processing so the
                Waveform never remounts: its bars morph into the processing dots
                purely via CSS. */}
            {(isRecording || state === "processing") && (
              <div className="pill-content pill-content-recording">
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
