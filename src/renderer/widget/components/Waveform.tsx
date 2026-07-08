import React, { useEffect, useRef } from "react";

/**
 * Live, voice-reactive waveform.
 *
 * Driven by the real mic level streamed from the recorder (widget-audio-level).
 * The newest level lands in the CENTRE bar and older levels ripple outward, so
 * speech makes a wave that flows out from the middle — some bars tall, some
 * short. When silent, every bar collapses to a flat dot.
 *
 * Bars are updated imperatively (via refs, no React re-render) for smoothness.
 * The mic levels (~30fps) only set TARGET heights; a 60fps rAF loop lerps each
 * bar toward its target so spikes glide instead of strobing (no CSS transition
 * on the bars — the lerp IS the animation).
 */
const BAR_COUNT = 10;
const RINGS = 5; // distinct distances from centre for an even bar count

// Silent bar = a perfect circle dot. Bar is 2px wide × 12px tall, so scaling to
// 2px tall (2/12 ≈ 0.167) makes the fully-rounded bar render as a round dot.
const MIN_SCALE = 0.167; // silent → a circular dot (matches wf-bar 2×12 in CSS)
const NOISE_FLOOR = 0.01; // ignore ambient hiss below this RMS
const GAIN = 8.5; // maps speech RMS → bar height (tuned for speech range)

// Per-frame lerp factors (at 60fps). Bars rise quickly when speech hits but
// settle back gently — an asymmetric envelope that reads as a fluid wave.
const ATTACK = 0.35; // toward a louder target
const RELEASE = 0.12; // toward a quieter target

export default function Waveform() {
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const ringsRef = useRef<number[]>(new Array(RINGS).fill(0));
  const scalesRef = useRef<number[]>(new Array(BAR_COUNT).fill(MIN_SCALE));

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const rings = ringsRef.current;
      const scales = scalesRef.current;
      for (let j = 0; j < BAR_COUNT; j += 1) {
        const dist = Math.abs(j - (BAR_COUNT - 1) / 2); // 0.5 .. 4.5
        const ring = Math.min(Math.floor(dist), RINGS - 1);
        const target = Math.min(1, MIN_SCALE + (rings[ring] || 0));
        const current = scales[j];
        const k = target > current ? ATTACK : RELEASE;
        const next = current + (target - current) * k;
        scales[j] = next;
        const el = barsRef.current[j];
        if (el) el.style.transform = `scaleY(${next.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };

    const onLevel = (_e: unknown, rms: number) => {
      const amp = Math.max(0, rms - NOISE_FLOOR) * GAIN;
      const rings = ringsRef.current;
      rings.unshift(amp); // newest at centre
      rings.length = RINGS; // ripple older values outward
    };

    const unsubscribe = window.electron.onWidgetAudioLevel(onLevel);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
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
