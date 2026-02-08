import React, { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import DictionaryPage from "./pages/DictionaryPage";
import SettingsPage from "./pages/SettingsPage";

type Page = "home" | "dictionary" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "dictionary", label: "Dictionary", icon: "dictionary" },
  { id: "settings", label: "Settings", icon: "settings" },
];

// StayFree Logo - 5 bar audio waveform
function StayFreeLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {/* 5 bars with rounded ends, center tallest */}
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="7" x2="8" y2="17" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="16" y1="7" x2="16" y2="17" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  );
}

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "#2563eb" : "#6b7280";

  if (type === "home") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  }
  if (type === "dictionary") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  // settings
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>("home");
  const [version, setVersion] = useState("");

  useEffect(() => {
    window.electron.getAppVersion().then(setVersion);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 select-none">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Traffic light safe zone - IMPORTANT: This creates space for macOS traffic lights */}
        <div
          className="h-14 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        {/* Logo and App Name - Below traffic lights */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white">
              <StayFreeLogo />
            </div>
            <span className="font-semibold text-gray-900 text-lg">
              StayFree
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pt-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activePage === item.id
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <NavIcon type={item.icon} active={activePage === item.id} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Version info at bottom */}
        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">StayFree v{version}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Drag region for content area */}
        <div
          className="h-14 sticky top-0 bg-gray-50 z-10 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="px-8 pb-8">
          {activePage === "home" && <HomePage />}
          {activePage === "dictionary" && <DictionaryPage />}
          {activePage === "settings" && <SettingsPage />}
        </div>
      </div>
    </div>
  );
}
