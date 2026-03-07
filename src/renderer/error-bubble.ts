/**
 * Error Bubble Renderer
 *
 * Standalone floating window that shows an error message above the widget.
 * No React — just a single div rendered directly.
 */
type WidgetErrorPayload = {
  code: "NO_AUDIO" | "STREAM_TIMEOUT" | "WS_CLOSED" | "SERVER_ERROR";
  message: string;
};

// Inject styles
const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body, #app {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent !important;
  }

  .error-bubble {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 14px;
    gap: 7px;
    background: rgba(24, 14, 14, 0.94);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 22px;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.5),
      0 0 0 0.5px rgba(239, 68, 68, 0.15);
    animation: pop-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    -webkit-user-select: none;
  }

  @keyframes pop-in {
    from { transform: scale(0.8) translateY(6px); opacity: 0; }
    to   { transform: scale(1)   translateY(0);   opacity: 1; }
  }

  .error-icon {
    font-size: 13px;
    line-height: 1;
    flex-shrink: 0;
  }

  .error-text {
    font-size: 12px;
    font-weight: 500;
    color: rgba(252, 165, 165, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
    flex: 1;
  }

  .error-close {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 9px;
    background: rgba(239, 68, 68, 0.16);
    color: rgba(254, 202, 202, 0.95);
    font-size: 12px;
    line-height: 18px;
    text-align: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .error-close:hover {
    background: rgba(239, 68, 68, 0.3);
  }

`;
document.head.appendChild(style);

// Render bubble into #app
const app = document.getElementById("app");
if (app) {
  app.innerHTML = `
    <div class="error-bubble">
      <span class="error-icon">⚠︎</span>
      <span class="error-text" id="error-msg">Error</span>
      <button class="error-close" id="error-close-btn" type="button">×</button>
    </div>
  `;
}

const closeBtn = document.getElementById("error-close-btn");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.electron.dismissErrorBubble();
  });
}

// Listen for message updates from main process
window.electron.onErrorMessage((_event, payload: WidgetErrorPayload | string) => {
  const el = document.getElementById("error-msg");
  const normalizedPayload: WidgetErrorPayload =
    typeof payload === "string"
      ? { code: "SERVER_ERROR", message: payload }
      : payload;

  if (el) el.textContent = normalizedPayload.message;
});

export {};
