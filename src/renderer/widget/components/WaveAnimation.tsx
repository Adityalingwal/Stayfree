import React from "react";

interface WaveAnimationProps {
  isActive: boolean;
  audioLevels: number[]; // Rolling history — each bar gets its own level
}

/**
 * Dynamic voice-reactive wave animation with forward-scrolling motion.
 *
 * Each bar is driven by a different historical audio level from a rolling
 * buffer. As new levels arrive they appear on the right and old levels
 * scroll out to the left, creating a flowing waveform effect.
 *
 * A subtle bell-curve envelope is applied so the centre bars appear
 * slightly taller, keeping the organic waveform shape even while scrolling.
 */
export default function WaveAnimation({
  isActive,
  audioLevels,
}: WaveAnimationProps) {
  const barCount = audioLevels.length;

  // Frozen state heights (gentle curve — center tallest)
  const frozenHeights = [4, 6, 8, 10, 8, 6, 4];

  // Subtle bell-curve envelope so center bars are slightly emphasised
  // even while scrolling (keeps the waveform shape pretty)
  const envelope = generateEnvelope(barCount);

  // Nearly flat when silent — just 1px baseline
  const MIN_HEIGHT = 1;
  // Max height for loud speech
  const MAX_HEIGHT = 14;

  return (
    <div className={isActive ? "widget-wave-container" : "widget-frozen-wave"}>
      {Array.from({ length: barCount }).map((_, i) => {
        if (!isActive) {
          // Frozen / idle state
          const frozenHeight = frozenHeights[i] || 6;
          return (
            <div
              key={i}
              className="widget-frozen-bar"
              style={{ height: `${frozenHeight}px` }}
            />
          );
        }

        // Active (recording) state — height driven by rolling audio level
        const level = audioLevels[i] || 0;
        const env = envelope[i];
        const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * level * env;

        return (
          <div
            key={i}
            className="widget-wave-bar active-bar"
            style={{
              height: `${Math.max(MIN_HEIGHT, height)}px`,
              opacity: 0.5 + 0.5 * Math.max(0.1, level),
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Generate a bell-curve envelope array for `n` bars.
 * Centre = 1.0, edges ≈ 0.6, creating a natural waveform shape.
 */
function generateEnvelope(n: number): number[] {
  const envelope: number[] = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    // Gaussian-ish: 0.6 at edges, 1.0 at center
    const dist = Math.abs(i - mid) / mid; // 0 at center, 1 at edge
    envelope.push(0.6 + 0.4 * (1 - dist * dist));
  }
  return envelope;
}
