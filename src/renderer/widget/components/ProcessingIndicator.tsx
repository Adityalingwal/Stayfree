import React from "react";

/**
 * Processing state content — a lavender multi-spoke activity spinner (matches
 * the Wispr flow reference). The dim dots to its left are NOT rendered here:
 * they are the frozen Waveform bars, which stay mounted through the
 * recording → processing transition and collapse to dots via CSS.
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
