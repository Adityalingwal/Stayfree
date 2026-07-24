import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  CaretRight,
  Check,
  LockKey,
  Microphone,
  PersonSimpleCircle,
} from "@phosphor-icons/react";
import "./onboarding.css";

// Webpack emits this image as a renderer asset and returns its final URL.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appIconUrl: string = require("../assets/appIcon.png");

interface PermissionStatus {
  mic: "not-determined" | "granted" | "denied" | "restricted" | "unknown";
  inputAutomation: boolean | null;
  platform: "darwin" | "win32" | "linux";
}

// Synchronous platform guess from browser — available immediately, no async needed.
// checkPermissions() will confirm/correct it once it resolves.
function guessPlatform(): "darwin" | "win32" | "linux" {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "darwin";
  if (p.includes("win")) return "win32";
  return "linux";
}

function OnboardingApp() {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    mic: "not-determined",
    inputAutomation: null,
    platform: guessPlatform(),
  });
  const [micRequesting, setMicRequesting] = useState(false);

  const checkPermissions = useCallback(async () => {
    const status = await window.electron.checkPermissions();
    setPermissions(status);
  }, []);

  // Poll permissions every 2 seconds (user may grant in System Settings)
  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  const handleMicPermission = async () => {
    setMicRequesting(true);
    await window.electron.requestMicPermission();
    await checkPermissions();
    setMicRequesting(false);
  };

  const handleAccessibilitySettings = () => {
    window.electron.openAccessibilitySettings();
  };

  const handleContinue = () => {
    window.electron.completeOnboarding();
  };

  const allPermissionsGranted =
    permissions.mic === "granted" &&
    (permissions.platform === "darwin" ? permissions.inputAutomation : true);
  const isMac = permissions.platform === "darwin";
  const pushToTalkShortcut = isMac ? "Left Option" : "Ctrl + Win";

  return (
    <main className="onboarding-page">
      <div className="window-drag-region" aria-hidden="true" />

      <section className="onboarding-content">
        <div className="brand-lockup">
          <img className="brand-icon" src={appIconUrl} alt="" />
          <span>StayFree</span>
        </div>

        <header className="setup-header">
          <h1>Set up StayFree</h1>
          <p>
            {isMac
              ? "Allow two permissions, then hold Left Option to dictate anywhere."
              : "Allow microphone access, then hold Ctrl + Win to dictate anywhere."}
          </p>
        </header>

        <div className="permission-list">
          <article
            className={`permission-row ${
              permissions.mic === "granted" ? "is-complete" : ""
            }`}
          >
            <Microphone className="permission-icon" size={30} weight="regular" />
            <div className="permission-copy">
              <h2>Microphone</h2>
              <p>Capture your voice while you dictate.</p>
            </div>
            {permissions.mic === "granted" ? (
              <div className="permission-granted">
                <span className="granted-icon" aria-hidden="true">
                  <Check size={15} weight="bold" />
                </span>
                <span>Granted</span>
                <CaretRight size={18} aria-hidden="true" />
              </div>
            ) : (
              <button
                className="permission-action"
                onClick={handleMicPermission}
                disabled={micRequesting}
              >
                {micRequesting ? "Requesting…" : "Allow"}
              </button>
            )}
          </article>

          {isMac && (
            <article
              className={`permission-row ${
                permissions.inputAutomation ? "is-complete" : ""
              }`}
            >
              <PersonSimpleCircle
                className="permission-icon"
                size={30}
                weight="regular"
              />
              <div className="permission-copy">
                <h2>Accessibility</h2>
                <p>Paste the transcript into your active field.</p>
              </div>
              {permissions.inputAutomation ? (
                <div className="permission-granted">
                  <span className="granted-icon" aria-hidden="true">
                    <Check size={15} weight="bold" />
                  </span>
                  <span>Granted</span>
                  <CaretRight size={18} aria-hidden="true" />
                </div>
              ) : (
                <button
                  className="permission-action"
                  onClick={handleAccessibilitySettings}
                >
                  Open Settings
                </button>
              )}
            </article>
          )}
        </div>

        <div className="privacy-note">
          <LockKey size={17} weight="regular" aria-hidden="true" />
          <span>
            Audio is sent securely to Sarvam AI for transcription and isn’t
            stored by StayFree.
          </span>
        </div>

        <div className="setup-footer">
          <button
            className="continue-button"
            onClick={handleContinue}
            disabled={!allPermissionsGranted}
          >
            {allPermissionsGranted
              ? "Start using StayFree"
              : isMac
                ? "Complete both permissions"
                : "Allow microphone access"}
          </button>
          <div className="shortcut-hint">
            <kbd>{pushToTalkShortcut}</kbd>
            <span>to dictate</span>
          </div>
        </div>
      </section>
    </main>
  );
}

// Mount React app
const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<OnboardingApp />);
}
