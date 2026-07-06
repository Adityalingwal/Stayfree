import React from "react";

/**
 * Processing state content — a row of dim grey dots on the left and a lavender
 * multi-spoke activity spinner on the right (matches the Wispr flow reference).
 */
const DOT_COUNT = 10;
const SPOKE_COUNT = 11;

export default function ProcessingIndicator() {
  return (
    <div className="proc">
      <div className="proc-dots">
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span key={i} className="proc-dot" />
        ))}
      </div>
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
