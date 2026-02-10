import React, { useState, useEffect } from "react";

interface AudioDevice {
  deviceId: string;
  label: string;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [sarvamApiKey, setSarvamApiKey] = useState(""); // NEW
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSarvamKey, setShowSarvamKey] = useState(false); // NEW
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [sarvamKeySaved, setSarvamKeySaved] = useState(false); // NEW
  const [selectedMic, setSelectedMic] = useState("");
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [languagePreference, setLanguagePreference] = useState<
    "english" | "hindi"
  >("english"); // NEW
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load settings
    window.electron.getSettings().then((settings) => {
      setApiKey(settings.groqApiKey);
      setSarvamApiKey(settings.sarvamApiKey || "");
      setLanguagePreference(settings.languagePreference || "english");
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

  const handleSaveSarvamKey = async () => {
    window.electron.saveSarvamApiKey(sarvamApiKey);
    setSarvamKeySaved(true);
    setTimeout(() => setSarvamKeySaved(false), 2000);
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

  const handleLanguageChange = (lang: "english" | "hindi") => {
    setLanguagePreference(lang);
    window.electron.saveLanguagePreference(lang);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Configure StayFree.</p>

      <div className="space-y-6">
        {/* Language Selection - NEW */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Language</h2>
          <p className="text-xs text-gray-400 mb-4">
            Choose your primary dictation language
          </p>

          <div className="space-y-3">
            <label className="flex items-start cursor-pointer group">
              <input
                type="radio"
                name="language"
                value="english"
                checked={languagePreference === "english"}
                onChange={(e) =>
                  handleLanguageChange(e.target.value as "english")
                }
                className="mt-1 mr-3 w-4 h-4 text-blue-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  English
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Best for pure English dictation with LLM formatting
                </p>
              </div>
            </label>

            <label className="flex items-start cursor-pointer group">
              <input
                type="radio"
                name="language"
                value="hindi"
                checked={languagePreference === "hindi"}
                onChange={(e) =>
                  handleLanguageChange(e.target.value as "hindi")
                }
                className="mt-1 mr-3 w-4 h-4 text-blue-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  Hinglish
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  For mixed Hindi-English in Roman script (bhai, meeting, etc)
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Groq API Key */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            Groq API Key
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            {languagePreference === "english" ? (
              <>
                Required for English transcription and formatting. Get your key
                at <span className="text-blue-500">console.groq.com</span>
              </>
            ) : (
              <>Not required for Hinglish (using Sarvam AI)</>
            )}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                disabled={languagePreference === "hindi"}
                className={`w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  languagePreference === "hindi"
                    ? "bg-gray-100 text-gray-400"
                    : ""
                }`}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={languagePreference === "hindi"}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                apiKeySaved
                  ? "bg-green-500 text-white"
                  : languagePreference === "hindi"
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {apiKeySaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Sarvam AI API Key - NEW (shown only when Hindi selected) */}
        {languagePreference === "hindi" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Sarvam AI API Key
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Required for Hinglish transcription. Get free ₹1000 credits at{" "}
              <a
                href="https://dashboard.sarvam.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline hover:text-blue-600"
              >
                dashboard.sarvam.ai
              </a>
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showSarvamKey ? "text" : "password"}
                  value={sarvamApiKey}
                  onChange={(e) => setSarvamApiKey(e.target.value)}
                  placeholder="your_sarvam_api_key"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => setShowSarvamKey(!showSarvamKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showSarvamKey ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                onClick={handleSaveSarvamKey}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  sarvamKeySaved
                    ? "bg-green-500 text-white"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {sarvamKeySaved ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        )}

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
                style={{
                  transform: soundEnabled
                    ? "translateX(22px)"
                    : "translateX(2px)",
                }}
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
              <span className="text-gray-500">Language Mode</span>
              <span className="text-gray-900">
                {languagePreference === "english" ? "English" : "Hinglish"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">STT Model</span>
              <span className="text-gray-900">
                {languagePreference === "english"
                  ? "Whisper v3 Turbo"
                  : "Saaras v3"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Formatter</span>
              <span className="text-gray-900">
                {languagePreference === "english"
                  ? "Llama 3.1 8B"
                  : "None (raw)"}
              </span>
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
