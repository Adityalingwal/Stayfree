import React, { useState, useEffect } from "react";

function guessPlatform(): "darwin" | "win32" | "linux" {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "darwin";
  if (p.includes("win")) return "win32";
  return "linux";
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

// ─── Icons ──────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── Section Card ───────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
  accent = "#6366f1",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #e8eaf0",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05), 0 0 0 0 transparent",
        transition: "box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 16px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 1px 4px rgba(0,0,0,0.05)";
      }}
    >
      {/* Card Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f1f3f8",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "linear-gradient(135deg, #fafbff 0%, #ffffff 100%)",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${accent}18, ${accent}10)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#0f172a",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "1px" }}>
            {description}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

// ─── Toggle Switch ──────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  accent = "#6366f1",
}: {
  checked: boolean;
  onChange: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onChange}
      style={{
        position: "relative",
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        border: "none",
        cursor: "pointer",
        background: checked
          ? `linear-gradient(135deg, ${accent}, ${accent}cc)`
          : "#e2e8f0",
        transition: "background 0.25s ease",
        flexShrink: 0,
        padding: 0,
        boxShadow: checked ? `0 0 0 3px ${accent}22` : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "2px",
          left: checked ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          transition: "left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

// ─── About Row ──────────────────────────────────────────────────

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid #f1f3f8",
      }}
    >
      <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          color: "#0f172a",
          fontWeight: 600,
          fontFamily: label === "Hotkey" ? "monospace" : "inherit",
          background: label === "Hotkey" ? "#f1f5f9" : "transparent",
          padding: label === "Hotkey" ? "2px 8px" : "0",
          borderRadius: label === "Hotkey" ? "6px" : "0",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function SettingsPage() {
  const [platform, setPlatform] = useState<"darwin" | "win32" | "linux">(
    guessPlatform(),
  );
  const [selectedMic, setSelectedMic] = useState("");
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electron.getSettings().then((settings) => {
      setSelectedMic(settings.selectedMicId);
      setSoundEnabled(settings.soundEnabled);
      setLoading(false);
    });

    window.electron
      .checkPermissions()
      .then((status) => setPlatform(status.platform))
      .catch(() => setPlatform(guessPlatform()));

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
      .catch((err) => console.warn("Mic enumeration failed:", err));
  }, []);

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
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "200px",
          color: "#94a3b8",
          fontSize: "14px",
        }}
      >
        Loading…
      </div>
    );
  }

  const platformLabel = platform === "win32" ? "Windows" : "macOS";
  const hotkeyLabel = platform === "win32" ? "Left Alt" : "Left Option (Alt)";

  return (
    <div style={{ maxWidth: "600px" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 4px 0",
            letterSpacing: "-0.03em",
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
          Customize your StayFree experience
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── Microphone ── */}
        <SectionCard
          icon={<MicIcon />}
          title="Microphone"
          description="Select input device for dictation"
          accent="#0ea5e9"
        >
          <div style={{ position: "relative" }}>
            <select
              value={selectedMic}
              onChange={(e) => handleMicChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 36px 10px 14px",
                borderRadius: "10px",
                border: "1.5px solid #e8eaf0",
                fontSize: "13px",
                fontWeight: 500,
                color: "#0f172a",
                background: "#fafbff",
                appearance: "none",
                WebkitAppearance: "none",
                outline: "none",
                cursor: "pointer",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease",
              }}
              onFocus={(e) => {
                (e.target as HTMLSelectElement).style.borderColor = "#6366f1";
                (e.target as HTMLSelectElement).style.boxShadow = "0 0 0 3px #6366f115";
              }}
              onBlur={(e) => {
                (e.target as HTMLSelectElement).style.borderColor = "#e8eaf0";
                (e.target as HTMLSelectElement).style.boxShadow = "none";
              }}
            >
              <option value="">System Default</option>
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
            <div
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#94a3b8",
              }}
            >
              <ChevronIcon />
            </div>
          </div>
        </SectionCard>

        {/* ── Sound Effects ── */}
        <SectionCard
          icon={<SoundIcon />}
          title="Sound Effects"
          description="Audio feedback when recording starts and stops"
          accent="#10b981"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 0",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#0f172a",
                  marginBottom: "2px",
                }}
              >
                {soundEnabled ? "Enabled" : "Disabled"}
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                {soundEnabled
                  ? "You'll hear a beep on record start/stop"
                  : "Silent mode — no audio cues"}
              </div>
            </div>
            <Toggle
              checked={soundEnabled}
              onChange={handleSoundToggle}
              accent="#10b981"
            />
          </div>
        </SectionCard>

        {/* ── About ── */}
        <SectionCard
          icon={<InfoIcon />}
          title="About"
          description="System information and configuration details"
          accent="#f59e0b"
        >
          <div>
            <AboutRow label="Platform" value={platformLabel} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0 0 0",
              }}
            >
              <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>
                Hotkey
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  background: "#f1f5f9",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                }}
              >
                {hotkeyLabel}
              </span>
            </div>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
