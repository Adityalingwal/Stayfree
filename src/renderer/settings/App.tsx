import React, { useState } from "react";
import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import "./dashboard.css";

type Page = "home" | "settings";
// Webpack emits this image as a renderer asset and returns its final URL.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appIconUrl: string = require("../../assets/appIcon.png");

const TABS: { id: Page; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "settings", label: "Settings" },
];

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.3a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>("home");
  const isMac = navigator.platform.toLowerCase().includes("mac");

  return (
    <div className={isMac ? "dashboard-app is-mac" : "dashboard-app"}>
      <header className="dashboard-titlebar">
        <button
          className="dashboard-brand"
          onClick={() => setActivePage("home")}
          aria-label="Open StayFree home"
        >
          <img src={appIconUrl} alt="" />
          <span>StayFree</span>
        </button>

        <nav className="dashboard-nav" aria-label="Dashboard">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={activePage === tab.id ? "is-active" : ""}
              onClick={() => setActivePage(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="dashboard-actions">
          <button className="titlebar-action" title="Notifications">
            <BellIcon />
          </button>
          <button
            className="titlebar-action"
            title="Settings"
            onClick={() => setActivePage("settings")}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        {activePage === "home" ? <HomePage /> : <SettingsPage />}
      </main>
    </div>
  );
}
