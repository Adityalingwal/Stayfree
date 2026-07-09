import React, { useEffect, useRef } from "react";

/**
 * Live, voice-reactive waveform.
 *
 * The recorder streams the real mic RMS (~30fps, `widget-audio-level`). We smooth
 * that into a single "voice energy" envelope (fast attack, slow release) and then
 * shape it across the bars:
 *   1. a SYMMETRIC spatial envelope — tallest at the centre, tapering to the
 *      edges — so speech reads as one contained wave, never a random skyline; and
 *   2. a slow TRAVELLING ripple so a sustained voice keeps undulating.
 *
 * When you're SILENT (recording but not speaking) every bar sits still at the
 * floor — a calm, even resting row. The moment real speech comes in the wave
 * animates up out of it. A noise gate keeps room hiss from being mistaken for
 * speech.
 *
 * Bars are driven imperatively (refs, no React re-render) at 60fps for
 * smoothness: mic level only sets a target; the rAF loop eases every bar toward
 * it (no CSS transition on the bars — the easing IS the animation).
 */
const BAR_COUNT = 11; // odd → a true centre bar for a clean wave crest
const CENTRE = (BAR_COUNT - 1) / 2;

// Bars are 2px wide × up to 12px tall, height animated DIRECTLY (not scaleY) so
// the rounded caps never squish flat. The floor is deliberately kept well above
// the 2px width (~3.5px) so EVERY bar always has a visible straight body between
// its rounded ends — i.e. it always reads as a uniform-width thin rounded bar,
// never collapsing into a fat round dot. That's what keeps all the bars looking
// the SAME width regardless of height. `scales` holds a 0..1 fraction; the pixel
// height is that fraction × BAR_MAX_PX.
const MIN_SCALE = 0.29; // ~3.5px floor → uniform-width bars, never dot-like blobs
const BAR_MAX_PX = 12; // full-height bar in px (matches CSS .wf / .wf-bar height)

// --- Voice gate (real speech vs. ambient) ---
const NOISE_FLOOR = 0.02; // RMS below this is ambient hiss → ignored entirely
const GAIN = 12; // maps speech RMS above the floor into 0..1 energy
const SILENCE_GATE = 0.05; // smoothed energy below this counts as silence

// Envelope follower on the master voice energy: rises fast when speech hits,
// falls gently so the tail of a word glides down instead of strobing.
const ATTACK = 0.3;
const RELEASE = 0.11;
const BAR_EASE = 0.45; // final per-bar glide toward its target height

// Spatial shape of the SPEECH wave: centre tallest, edges shortest.
const EDGE_FLOOR = 0.35; // outermost bars reach this fraction of the centre

// A slow ripple travels through the bars while you speak (multiplied by energy,
// so it's invisible at silence).
const FLOW_SPEED = 0.006; // rad/ms
const FLOW_STEP = 0.8; // phase offset per bar → the ripple's wavelength
const FLOW_DEPTH = 0.28; // how much the ripple modulates each bar

// Per-bar spatial envelope is constant across frames — precompute once.
const ENVELOPE = Array.from({ length: BAR_COUNT }, (_, i) => {
  const d = Math.abs(i - CENTRE) / CENTRE; // 0 at centre → 1 at the edges
  return EDGE_FLOOR + (1 - EDGE_FLOOR) * Math.cos((d * Math.PI) / 2);
});

export default function Waveform() {
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const scalesRef = useRef<number[]>(new Array(BAR_COUNT).fill(MIN_SCALE));
  const targetRef = useRef(0); // raw energy target from the latest mic level
  const energyRef = useRef(0); // smoothed voice energy (envelope follower)

  useEffect(() => {
    let raf = 0;

    const tick = (now: number) => {
      // 1. Follow the voice energy: fast up, slow down.
      const target = targetRef.current;
      const k = target > energyRef.current ? ATTACK : RELEASE;
      energyRef.current += (target - energyRef.current) * k;
      const energy = energyRef.current < SILENCE_GATE ? 0 : energyRef.current;

      const scales = scalesRef.current;
      for (let j = 0; j < BAR_COUNT; j += 1) {
        // Speech wave: spatial envelope × travelling ripple, scaled by energy.
        // When silent (energy 0) every bar sits still at the floor — no idle
        // motion.
        const flow =
          1 - FLOW_DEPTH * (0.5 + 0.5 * Math.sin(now * FLOW_SPEED - j * FLOW_STEP));
        let lift = energy * ENVELOPE[j] * flow;
        if (lift > 1) lift = 1;

        const targetScale = MIN_SCALE + lift * (1 - MIN_SCALE);
        const next = scales[j] + (targetScale - scales[j]) * BAR_EASE;
        scales[j] = next;
        const el = barsRef.current[j];
        if (el) el.style.height = `${(next * BAR_MAX_PX).toFixed(2)}px`;
      }
      raf = requestAnimationFrame(tick);
    };

    const onLevel = (_e: unknown, rms: number) => {
      const amp = (rms - NOISE_FLOOR) * GAIN;
      targetRef.current = amp < 0 ? 0 : amp > 1 ? 1 : amp;
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
