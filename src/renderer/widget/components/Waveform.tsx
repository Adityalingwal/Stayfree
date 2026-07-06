import React from "react";

/**
 * Live-looking waveform — a row of white rounded bars in a symmetric "bell"
 * envelope (tallest in the centre, tapering to the edges) that animate up/down
 * with staggered timing so it reads as a live mic waveform. Pure CSS (see
 * widget.css .wf-*), no real audio wiring.
 */
const BAR_COUNT = 11;

export default function Waveform() {
  return (
    <div className="wf">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span key={i} className="wf-bar" />
      ))}
    </div>
  );
}
