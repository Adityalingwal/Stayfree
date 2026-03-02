import React from "react";

interface ErrorStateProps {
  message: string;
}

/**
 * Error State — floating bubble with warning icon + message
 * Appears above the dock, auto-dismisses after 4s (controlled by main process)
 */
export default function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="widget-error">
      <span className="widget-error-icon">⚠</span>
      <span className="widget-error-text">{message}</span>
    </div>
  );
}
