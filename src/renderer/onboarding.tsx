import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

interface PermissionStatus {
  mic: string; // 'granted' | 'denied' | 'not-determined'
  accessibility: boolean;
}

function OnboardingApp() {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    mic: "not-determined",
    accessibility: false,
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

  const handleKeyboardSettings = () => {
    window.electron.openKeyboardSettings();
  };

  const handleContinue = () => {
    window.electron.completeOnboarding();
  };

  const allPermissionsGranted =
    permissions.mic === "granted" && permissions.accessibility;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-8 select-none">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to StayFree
          </h1>
          <p className="text-gray-500 text-sm">
            Voice dictation for macOS. Hold a key, speak, release — text
            appears.
          </p>
        </div>

        {/* Permissions */}
        <div className="space-y-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Required Permissions
          </h2>

          {/* Microphone */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-0.5">
                  {permissions.mic === "granted" ? (
                    <span className="text-green-500">&#10003;</span>
                  ) : (
                    <span className="text-red-400">&#10007;</span>
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Microphone Access
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    To capture your voice for transcription
                  </p>
                </div>
              </div>
              {permissions.mic !== "granted" && (
                <button
                  onClick={handleMicPermission}
                  disabled={micRequesting}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {micRequesting ? "Requesting..." : "Grant"}
                </button>
              )}
            </div>
          </div>

          {/* Accessibility */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-0.5">
                  {permissions.accessibility ? (
                    <span className="text-green-500">&#10003;</span>
                  ) : (
                    <span className="text-red-400">&#10007;</span>
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Accessibility Access
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    To paste text into your active app via Cmd+V
                  </p>
                </div>
              </div>
              {!permissions.accessibility && (
                <button
                  onClick={handleAccessibilitySettings}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
                >
                  Open Settings
                </button>
              )}
            </div>
            {!permissions.accessibility && (
              <p className="text-xs text-gray-400 mt-3 ml-9">
                System Settings &rarr; Privacy &amp; Security &rarr;
                Accessibility &rarr; Enable StayFree (or Electron)
              </p>
            )}
          </div>
        </div>

        {/* Fn Key Setup (Optional) */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Recommended Setup
          </h2>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <div className="text-xl mt-0.5">&#9881;</div>
              <div>
                <h3 className="font-medium text-gray-900 text-sm">
                  Fn Key Configuration
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  For the best experience, set your Fn key to &quot;Do
                  Nothing&quot; in macOS settings so it can be used as
                  push-to-talk.
                </p>
                <button
                  onClick={handleKeyboardSettings}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Open Keyboard Settings &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!allPermissionsGranted}
          className={`w-full py-3 rounded-xl font-semibold text-base transition-all ${
            allPermissionsGranted
              ? "bg-blue-500 text-white hover:bg-blue-600 shadow-md hover:shadow-lg"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {allPermissionsGranted
            ? "Get Started"
            : "Grant all permissions to continue"}
        </button>

        {allPermissionsGranted && (
          <p className="text-center text-xs text-gray-400 mt-3">
            StayFree will run in your menu bar. Look for the icon in the top
            right.
          </p>
        )}
      </div>
    </div>
  );
}

// Mount React app
const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<OnboardingApp />);
}
