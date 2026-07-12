import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Waveform from "./components/Waveform";
import ProcessingIndicator from "./components/ProcessingIndicator";

type WidgetState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "processing";

// Pill geometry per state, animated by framer-motion springs (the CSS classes
// only carry colors/border now). Ratios matched to the reference recording
// (~2.4:1), processing (~3.3:1, wider) and idle (~5:1, thin) proportions.
//
// GROW (idle → active): a true underdamped spring — the elastic rubber-band
// snap. Width leads height by a beat (30ms delay), exactly like the old CSS.
// CLOSE (→ idle): a deterministic no-overshoot tween. A spring here would
// undershoot below the 8px idle height and visibly clip (the same bug the old
// CSS curves were shaped around); height leads on the way down.
const growSpring = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.8,
} as const;

const closeEase = [0.4, 0, 0.2, 1] as const;

const pillVariants = {
  idle: {
    width: 40,
    height: 8,
    borderRadius: 4,
    transition: {
      width: { type: "tween", duration: 0.2, ease: closeEase, delay: 0.02 },
      height: { type: "tween", duration: 0.18, ease: closeEase },
      borderRadius: { type: "tween", duration: 0.2, ease: closeEase },
    },
  },
  "recording-hotkey": {
    width: 74,
    height: 30,
    borderRadius: 15,
    transition: {
      width: growSpring,
      height: { ...growSpring, delay: 0.03 },
      borderRadius: growSpring,
    },
  },
  "recording-click": {
    width: 124,
    height: 30,
    borderRadius: 15,
    transition: {
      width: growSpring,
      height: { ...growSpring, delay: 0.03 },
      borderRadius: growSpring,
    },
  },
  processing: {
    width: 98,
    height: 30,
    borderRadius: 15,
    transition: {
      width: growSpring,
      height: { ...growSpring, delay: 0.03 },
      borderRadius: growSpring,
    },
  },
} as const;

/**
 * Floating Dictation Widget — Wispr Flow style.
 *
 * The native window is a fixed size and NEVER resizes. The single persistent
 * ".widget-pill" shell morphs between states via framer-motion springs
 * (geometry in pillVariants above; CSS keeps only colors/layout), so the pill
 * morphs smoothly (grow → record → process → shrink) with no native-frame
 * animation glitch.
 *
 * Look (matched to the reference):
 *  - pill: cream fill, thin ink outline, full rounded stadium
 *  - idle: tiny thin oval with a visible ink outline
 *  - recording: ink bars pulsing in sync + a language badge ("HI"/"EN")
 *    floating to the left of the pill (fades out on its own after ~1.6s)
 *  - processing: the SAME waveform bars stay mounted and collapse to dim grey
 *    dots (via CSS) while a charcoal multi-spoke spinner fades in at the right
 *
 * The window is much larger than the pill and click-through by default; we make
 * it interactive only while the cursor is over the pill's hit area.
 * Pipeline errors are not surfaced in the UI — they are logged in main only.
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");

  useEffect(() => {
    window.electron.onWidgetState((_event, newState) => {
      setState(newState);
    });
  }, []);

  // Inner content (waveform / buttons / spinner) is mounted while active;
  // AnimatePresence keeps it mounted through the exit fade when going idle,
  // so the bars never snap to a corner mid-shrink.
  const active = state !== "idle";

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
          <motion.div
            className={`widget-pill pill-${state}${
              state === "idle" ? " widget-clickable" : ""
            }`}
            variants={pillVariants}
            animate={state}
            initial={false}
            whileHover={state === "idle" ? { scaleX: 1.08 } : undefined}
            whileTap={state === "idle" ? { scaleX: 0.95 } : undefined}
            onClick={handleClick}
          >
            {/* ONE persistent content block across recording → processing so the
                Waveform never remounts: its bars morph into the processing dots
                purely via CSS. Keyed by a CONSTANT (not `state`) for the same
                reason — a state-keyed motion.div would remount the Waveform and
                reset its refs. */}
            <AnimatePresence initial={false}>
              {active && (
                <motion.div
                  key="pill-content"
                  className="pill-content pill-content-recording"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
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
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
