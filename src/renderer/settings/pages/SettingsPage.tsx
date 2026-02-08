import React, { useState, useEffect } from "react";

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [selectedMic, setSelectedMic] = useState("");
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load settings
    window.electron.getSettings().then((settings) => {
      setApiKey(settings.groqApiKey);
      setSelectedMic(settings.selectedMicId);
      setSoundEnabled(settings.soundEnabled);
      setLoading(false);
    });

    // Enumerate microphones
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const mics = devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          }));
        setMicrophones(mics);
      })
      .catch(() => {
        // Mic enumeration may fail without permission
      });
  }, []);

  const handleSaveApiKey = async () => {
    await window.electron.saveApiKey(apiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    window.electron.saveSelectedMic(deviceId);
  };

  const handleSoundToggle = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    window.electron.saveSoundEnabled(newValue);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Configure StayFree.</p>

      <div className="space-y-6">
        {/* API Key */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            Groq API Key
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Required for speech-to-text and formatting. Get your key at{" "}
            <span className="text-blue-500">console.groq.com</span>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                apiKeySaved
                  ? "bg-green-500 text-white"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {apiKeySaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Microphone Selection */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            Microphone
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Select which microphone to use for dictation.
          </p>
          <select
            value={selectedMic}
            onChange={(e) => handleMicChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
          >
            <option value="">System Default</option>
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sound Effects */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                Sound Effects
              </h2>
              <p className="text-xs text-gray-400">
                Play a sound when recording starts and stops.
              </p>
            </div>
            <button
              onClick={handleSoundToggle}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                soundEnabled ? "bg-blue-500" : "bg-gray-300"
              }`}
            >
              <div
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ transform: soundEnabled ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </div>

        {/* About */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">About</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Platform</span>
              <span className="text-gray-900">macOS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">STT Model</span>
              <span className="text-gray-900">Whisper large-v3-turbo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Formatter</span>
              <span className="text-gray-900">Llama 3.1 8B</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hotkey</span>
              <span className="text-gray-900 font-mono">Left Option (Alt)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
