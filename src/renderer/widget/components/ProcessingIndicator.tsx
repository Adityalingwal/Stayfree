import React from "react";

/**
 * Processing state content — a charcoal multi-spoke activity spinner, shown
 * alone and centred in a compact pill (the waveform bars unmount entirely
 * during processing; App.tsx crossfades between the two contents).
 */
const SPOKE_COUNT = 11;

export default function ProcessingIndicator() {
  return (
    <div className="proc">
      <div className="proc-spinner">
        {Array.from({ length: SPOKE_COUNT }).map((_, i) => (
          <span
            key={i}
            className="proc-spoke"
            style={{
              transform: `rotate(${(360 / SPOKE_COUNT) * i}deg) translateY(-4.5px)`,
              opacity: 0.14 + (i / SPOKE_COUNT) * 0.86,
            }}
          />
        ))}
      </div>
    </div>
  );
}
