import React from "react";

interface WaveAnimationProps {
  isActive: boolean;
  barCount?: number;
}
export default function WaveAnimation({
  isActive,
  barCount = 5,
}: WaveAnimationProps) {
  // Heights for frozen state (gentle curve - center tallest)
  const frozenHeights = [8, 12, 16, 12, 8];

  return (
    <div className={isActive ? "widget-wave-container" : "widget-frozen-wave"}>
      {Array.from({ length: barCount }).map((_, i) => {
        const frozenHeight = frozenHeights[i] || 10;

        return (
          <div
            key={i}
            className={`${isActive ? "widget-wave-bar animate" : "widget-frozen-bar"}`}
            style={!isActive ? { height: `${frozenHeight}px` } : undefined}
          />
        );
      })}
    </div>
  );
}
