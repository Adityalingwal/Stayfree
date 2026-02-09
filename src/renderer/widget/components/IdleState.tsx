import React from "react";

interface IdleStateProps {
  onClick: () => void;
}

/**
 * Idle State - Minimal thin bar (Wispr style)
 * Just a simple thin line/bar
 */
export default function IdleState({ onClick }: IdleStateProps) {
  return <div className="widget-idle widget-clickable" onClick={onClick} />;
}
