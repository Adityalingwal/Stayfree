import React, { useState, useEffect, useRef, useCallback } from "react";
import IdleState from "./components/IdleState";
import RecordingState from "./components/RecordingState";
import ProcessingState from "./components/ProcessingState";

type WidgetState = "idle" | "recording-hotkey" | "recording-click" | "processing";

const BAR_COUNT = 7;

/**
 * Floating Dictation Widget - Wispr Flow style
 *
 * States:
 * 1. IDLE - Small bar
 * 2. RECORDING - Mic + waves (dynamic, voice-reactive, scrolling)
 * 3. PROCESSING - Spinner
 *
 * Audio levels are interpolated at 60fps via requestAnimationFrame
 * for buttery smooth wave animation with zero jitter.
 */
export default function App() {
  const [state, setState] = useState<WidgetState>("idle");
  const [audioLevels, setAudioLevels] = useState<number[]>(
    new Array(BAR_COUNT).fill(0),
  );

  // Target levels (set by IPC) — the animation loop interpolates toward these
  const targetLevelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  // Current displayed levels (what's being rendered)
  const displayLevelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  // Smoothed incoming level for the rolling buffer
  const smoothedRef = useRef(0);
  // Animation frame ID
  const rafRef = useRef<number | null>(null);
  // Whether we're in recording state
  const isRecordingRef = useRef(false);

  // 60fps animation loop — smoothly interpolates displayed levels toward targets
  const animate = useCallback(() => {
    const target = targetLevelsRef.current;
    const display = displayLevelsRef.current;
    let changed = false;

    for (let i = 0; i < BAR_COUNT; i++) {
      const diff = target[i] - display[i];
      if (Math.abs(diff) > 0.001) {
        // Smooth interpolation: ease toward target at ~12% per frame
        // At 60fps this creates a very smooth ~80ms visual transition
        const speed = diff > 0 ? 0.18 : 0.08; // faster rise, slower fall
        display[i] += diff * speed;
        changed = true;
      } else {
        display[i] = target[i];
      }
    }

    if (changed) {
      setAudioLevels([...display]);
    }

    if (isRecordingRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  useEffect(() => {
    window.electron.onWidgetState((_event, newState) => {
      setState(newState);

      const recording = newState === "recording-hotkey" || newState === "recording-click";
      isRecordingRef.current = recording;

      if (recording) {
        // Start animation loop
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(animate);
        }
      } else {
        // Stop animation loop and reset
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        smoothedRef.current = 0;
        targetLevelsRef.current = new Array(BAR_COUNT).fill(0);
        displayLevelsRef.current = new Array(BAR_COUNT).fill(0);
        setAudioLevels(new Array(BAR_COUNT).fill(0));
      }
    });

    window.electron.onAudioLevel((_event, level) => {
      // Smooth the incoming level
      const prev = smoothedRef.current;
      const isRising = level > prev;
      const smoothing = isRising ? 0.3 : 0.9; // attack vs decay
      smoothedRef.current = prev * smoothing + level * (1 - smoothing);

      // Rolling buffer: push new value to the LEFT, shift old ones RIGHT
      const newTargets = [smoothedRef.current, ...targetLevelsRef.current.slice(0, -1)];
      targetLevelsRef.current = newTargets;
      // Don't call setState here — the rAF loop handles rendering
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [animate]);

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
          audioLevels={audioLevels}
        />
      )}

      {state === "processing" && <ProcessingState />}
    </div>
  );
}
