import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Waveform from "./components/Waveform";
import ProcessingIndicator from "./components/ProcessingIndicator";

type WidgetState =
  | "idle"
  | "recording-hotkey"
  | "recording-click"
  | "processing"
  | "error";

/** Mirrors the main-process WidgetStatePayload shape (src/index.ts). */
type WidgetStatePayload = {
  state: WidgetState;
  message?: string;
  pipelineId?: number | null;
};

/** How long the error pill stays visible before auto-reverting to idle
 * (D1). Owned entirely on this side — main sends "error" once and its own
 * routine "idle" reset (which follows almost immediately) is intentionally
 * ignored while this timer is pending; see the ignore-idle-while-erroring
 * logic in the effect below. A genuinely new recording still interrupts
 * and clears it instantly. */
const ERROR_VISIBLE_MS = 3000;

// Pill geometry per state, animated by framer-motion springs (the CSS classes
// only carry colors/border now).
//
// !!! KEEP THE width/height VALUES IN SYNC with `PILL_SIZES` in src/index.ts !!!
// The main process hit-tests the real cursor position against this rect to
// decide when the widget window stops being click-through. This file owns the
// animation; main owns the hit-test, and it only reads the target sizes.
//
// Ratios matched to the reference recording
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
    width: 108,
    height: 30,
    borderRadius: 15,
    transition: {
      width: growSpring,
      height: { ...growSpring, delay: 0.03 },
      borderRadius: growSpring,
    },
  },
  // Processing shows ONLY the centred spinner (no bars/dots), so the pill
  // hugs it — a compact round-ish capsule.
  processing: {
    width: 48,
    height: 30,
    borderRadius: 15,
    transition: {
      width: growSpring,
      height: { ...growSpring, delay: 0.03 },
      borderRadius: growSpring,
    },
  },
  // Error: a distinct compact capsule with a warning glyph (D1). Slightly
  // wider than processing's spinner-only capsule to give the glyph room.
  error: {
    width: 56,
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
 *  - recording: ink bars pulsing in sync (click mode adds an X button on the
 *    left and an ink stop-dot on the right)
 *  - processing: a compact capsule with ONLY the charcoal multi-spoke spinner,
 *    centred — the bars unmount entirely (crossfade), no dots
 *  - error: a compact capsule with a warning glyph, shown for ERROR_VISIBLE_MS
 *    then auto-reverts to idle (D1) — main's own routine idle reset that
 *    follows right behind it is ignored while this is showing; a genuinely
 *    new recording still clears it immediately
 *
 * The window is much larger than the pill and click-through by default. This
 * side no longer has any say in that: the MAIN process polls the real cursor
 * position against the pill's real rect (PILL_SIZES / startWidgetHitPoll in
 * src/index.ts) and flips setIgnoreMouseEvents itself. The old approach —
 * onMouseEnter/onMouseLeave on a 236x46 `.widget-hit` div — made a ~98px dead
 * band on each side of the 40x8 idle pill swallow the user's clicks, and could
 * get permanently stuck interactive whenever the window moved out from under a
 * stationary cursor (dock show/hide) so no mouseleave ever fired.
 *
 * This side's only remaining obligation is the `widget-renderer-ready`
 * handshake fired at the end of the mount effect below: main keeps the window
 * fully click-through until it arrives, then replays the state it believes is
 * authoritative. Without it, a reload/crash would remount this tree at "idle"
 * while main went on hit-testing the last rect it sent.
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const errorRevertTimer = React.useRef<number | null>(null);

  useEffect(() => {
    window.electron.onWidgetState((_event, payload: WidgetStatePayload) => {
      if (payload.state === "error") {
        if (errorRevertTimer.current) {
          window.clearTimeout(errorRevertTimer.current);
        }
        setErrorMessage(payload.message);
        setState("error");
        errorRevertTimer.current = window.setTimeout(() => {
          errorRevertTimer.current = null;
          setState("idle");
        }, ERROR_VISIBLE_MS);
        return;
      }

      if (payload.state === "idle") {
        // A routine idle reset almost always follows an "error" send within
        // the same tick (main's finally block). While the error pill's own
        // timer is still pending, ignore it — the timer owns the revert.
        if (errorRevertTimer.current) return;
        setState("idle");
        return;
      }

      // recording-hotkey / recording-click / processing: a new action
      // always interrupts and clears any pending error immediately.
      if (errorRevertTimer.current) {
        window.clearTimeout(errorRevertTimer.current);
        errorRevertTimer.current = null;
      }
      setState(payload.state);
    });

    // Handshake — MUST be last, i.e. only once the listener above is installed.
    // Main replays its authoritative state in response and only then re-enables
    // cursor hit-testing. On a reload/crash this React tree remounts at "idle"
    // while main may still be tracking, say, a 108x30 recording-click pill; the
    // replay is what puts the two back in agreement instead of leaving an
    // invisible phantom hit rect on screen. Runs on EVERY mount, not just the
    // first launch.
    window.electron.notifyWidgetRendererReady();
  }, []);

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

  return (
    <div className="widget-root">
      {/* Layout only — this div bottom-anchors and centres the pill. Click-
          through is decided in the main process (see the doc comment above);
          do not re-add hover handlers here. */}
      <div className="widget-hit">
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
            {/* TWO crossfading contents, each hard-centred in the pill:
                - "wave": the mic bars (+ click-mode X / stop buttons) during
                  recording. ONE element across both recording states, so the
                  Waveform never remounts mid-recording.
                - "proc": ONLY the spinner, centred, during processing — no
                  bars/dots at all, so nothing can snap or shift when the
                  processing state starts or ends. */}
            <AnimatePresence initial={false}>
              {(state === "recording-hotkey" ||
                state === "recording-click") && (
                <motion.div
                  key="wave"
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

                  {state === "recording-click" && (
                    <button
                      className="widget-stop-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStop();
                      }}
                      aria-label="Stop"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path
                          d="M1.5 4.2L3.2 6L6.5 2.2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </motion.div>
              )}

              {state === "processing" && (
                <motion.div
                  key="proc"
                  className="pill-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                >
                  <ProcessingIndicator />
                </motion.div>
              )}

              {state === "error" && (
                <motion.div
                  key="error"
                  className="pill-content pill-content-error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                  title={errorMessage}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="7"
                      cy="7"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M7 4V7.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <circle cx="7" cy="10" r="0.9" fill="currentColor" />
                  </svg>
                  <span className="sr-only">{errorMessage ?? "Error"}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
