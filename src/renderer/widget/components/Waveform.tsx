import React, { useEffect, useRef } from "react";

/**
 * Live, voice-reactive waveform.
 *
 * Driven by the real mic level streamed from the recorder (widget-audio-level).
 * The newest level lands in the CENTRE bar and older levels ripple outward, so
 * speech makes a wave that flows out from the middle — some bars tall, some
 * short. When silent, every bar collapses to a flat dot.
 *
 * Bars are updated imperatively (via refs, no React re-render) for smoothness;
 * a short CSS transform-transition smooths the ~30fps steps into a fluid motion.
 */
const BAR_COUNT = 10;
const RINGS = 5; // distinct distances from centre for an even bar count

const MIN_SCALE = 0.12; // silent → a dot
const NOISE_FLOOR = 0.012; // ignore ambient hiss below this RMS
const GAIN = 7.5; // maps speech RMS → bar height

export default function Waveform() {
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const ringsRef = useRef<number[]>(new Array(RINGS).fill(0));

  useEffect(() => {
    const paint = () => {
      const rings = ringsRef.current;
      for (let j = 0; j < BAR_COUNT; j += 1) {
        const dist = Math.abs(j - (BAR_COUNT - 1) / 2); // 0.5 .. 4.5
        const ring = Math.min(Math.floor(dist), RINGS - 1);
        const level = rings[ring] || 0;
        const scale = Math.min(1, MIN_SCALE + level);
        const el = barsRef.current[j];
        if (el) el.style.transform = `scaleY(${scale.toFixed(3)})`;
      }
    };

    const onLevel = (_e: unknown, rms: number) => {
      const amp = Math.max(0, rms - NOISE_FLOOR) * GAIN;
      const rings = ringsRef.current;
      rings.unshift(amp); // newest at centre
      rings.length = RINGS; // ripple older values outward
      paint();
    };

    const unsubscribe = window.electron.onWidgetAudioLevel(onLevel);
    paint(); // start as dots
    return unsubscribe;
  }, []);

  return (
    <div className="wf">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          className="wf-bar"
          ref={(el) => {
            if (el) barsRef.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
