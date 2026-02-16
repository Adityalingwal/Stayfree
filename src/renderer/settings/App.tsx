import React, { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import DictionaryPage from "./pages/DictionaryPage";
import SettingsPage from "./pages/SettingsPage";

type Page = "home" | "dictionary" | "snippets" | "style" | "notes" | "settings";

// ─── Logo ──────────────────────────────────────────────────────
function Logo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
    >
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16" y1="6" x2="16" y2="18" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  );
}

// ─── Icons ─────────────────────────────────────────────────────
function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ─── Tab data ──────────────────────────────────────────────────
const TABS: { id: Page; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "dictionary", label: "Dictionary" },
  { id: "snippets", label: "Snippets" },
  { id: "style", label: "Style" },
  { id: "notes", label: "Notes" },
];

// ─── Pill Navigation ──────────────────────────────────────────
function PillNav({
  active,
  onChange,
}: {
  active: Page;
  onChange: (p: Page) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        backgroundColor: "#f1f5f9",
        borderRadius: "12px",
        padding: "3px",
      }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={
              {
                padding: "7px 18px",
                borderRadius: "9px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#0f172a" : "#94a3b8",
                backgroundColor: isActive ? "#fff" : "transparent",
                transition: "all 0.2s ease",
                WebkitAppRegion: "no-drag",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              } as React.CSSProperties
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Top Bar Icon ─────────────────────────────────────────────
function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={
        {
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: h ? "#f1f5f9" : "transparent",
          color: "#64748b",
          transition: "all 0.15s ease",
          WebkitAppRegion: "no-drag",
          padding: 0,
        } as React.CSSProperties
      }
    >
      {children}
    </button>
  );
}

// ─── Main App ──────────────────────────────────────────────────
export default function App() {
  const [activePage, setActivePage] = useState<Page>("home");
  const [version, setVersion] = useState("");

  useEffect(() => {
    window.electron.getAppVersion().then(setVersion);
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case "home":
        return <HomePage />;
      case "dictionary":
        return <DictionaryPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: "6px",
                  textTransform: "capitalize",
                }}
              >
                {activePage}
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                Coming soon.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: "none",
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ═══ TOP BAR ═══ */}
      <header
        style={
          {
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px 0 20px",
            flexShrink: 0,
            WebkitAppRegion: "drag",
            borderBottom: "1px solid #f1f5f9",
            position: "relative",
            zIndex: 20,
            backgroundColor: "#fff",
          } as React.CSSProperties
        }
      >
        {/* LEFT: Traffic lights space + Logo */}
        <div
          style={{ display: "flex", alignItems: "center", minWidth: "170px" }}
        >
          <div style={{ width: "74px", flexShrink: 0 }} />
          <div
            style={
              {
                display: "flex",
                alignItems: "center",
                gap: "9px",
                cursor: "pointer",
                WebkitAppRegion: "no-drag",
              } as React.CSSProperties
            }
            onClick={() => setActivePage("home")}
          >
            <div style={{ color: "#0f172a" }}>
              <Logo />
            </div>
            <span
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              StayFree
            </span>
          </div>
        </div>

        {/* CENTER: Pill Nav */}
        <PillNav active={activePage} onChange={setActivePage} />

        {/* RIGHT: Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minWidth: "170px",
            justifyContent: "flex-end",
          }}
        >
          <IconBtn title="Notifications">
            <BellIcon />
          </IconBtn>
          <IconBtn title="Settings" onClick={() => setActivePage("settings")}>
            <GearIcon />
          </IconBtn>
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "#fff",
        }}
      >
        <div
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            padding: "32px 48px 48px 48px",
          }}
        >
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
