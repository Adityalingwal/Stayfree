import React from "react";

/**
 * Small outlined circle badge shown to the left of the pill while recording —
 * indicates the active dictation language ("HI" for Hindi, "EN" for English).
 */
interface LangBadgeProps {
  lang: "english" | "hindi";
}

export default function LangBadge({ lang }: LangBadgeProps) {
  return (
    <div className="widget-badge">
      {lang === "hindi" ? "HI" : "EN"}
    </div>
  );
}
