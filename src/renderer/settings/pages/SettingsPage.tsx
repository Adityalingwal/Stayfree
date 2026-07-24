import React, { useEffect, useRef, useState } from "react";

function guessPlatform(): "darwin" | "win32" | "linux" {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "darwin";
  if (platform.includes("win")) return "win32";
  return "linux";
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4ZM16 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function ChevronIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      className={open ? "select-chevron is-open" : "select-chevron"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function SettingsCard({
  icon,
  eyebrow,
  title,
  description,
  className = "",
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`settings-card ${className}`}>
      <div className="settings-card-heading">
        <div className="settings-card-icon">{icon}</div>
        <div>
          <span className="settings-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

function DevicePicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: AudioDevice[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((device) => device.deviceId === value)?.label ??
    "System Default";

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const choices = [{ deviceId: "", label: "System Default" }, ...options];

  return (
    <div className="device-picker" ref={pickerRef}>
      <button
        className="device-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>
          <strong>{selectedLabel}</strong>
          <small>
            {value ? "Use this microphone for dictation" : "Follow your Mac input setting"}
          </small>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="device-picker-menu" role="listbox">
          {choices.map((device) => {
            const selected = device.deviceId === value;
            return (
              <button
                key={device.deviceId || "system-default"}
                className={selected ? "is-selected" : ""}
                onClick={() => {
                  onChange(device.deviceId);
                  setOpen(false);
                }}
                role="option"
                aria-selected={selected}
              >
                <span>
                  <strong>{device.label}</strong>
                  <small>
                    {device.deviceId
                      ? "Available microphone"
                      : "Recommended"}
                  </small>
                </span>
                {selected && <CheckIcon />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
        setMicrophones(
          devices
            .filter((device) => device.kind === "audioinput")
            .map((device) => ({
              deviceId: device.deviceId,
              label:
                device.label ||
                `Microphone ${device.deviceId.slice(0, 8)}`,
            })),
        );
      })
      .catch((error) =>
        console.warn("[Settings] Microphone list unavailable:", error),
      );
  }, []);

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    window.electron.saveSelectedMic(deviceId);
  };

  const handleSoundToggle = () => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    window.electron.saveSoundEnabled(nextValue);
  };

  if (loading) {
    return <div className="settings-loading">Loading settings…</div>;
  }

  const platformLabel = platform === "win32" ? "Windows" : "macOS";
  const hotkeyLabel = platform === "win32" ? "Left Alt" : "Left Option";

  return (
    <div className="settings-page">
      <div className="settings-page-heading">
        <span className="page-kicker">Preferences</span>
        <h1>Make StayFree work your way.</h1>
        <p>Choose your microphone and how the app responds while you dictate.</p>
      </div>

      <div className="settings-layout">
        <SettingsCard
          icon={<MicIcon />}
          eyebrow="Input"
          title="Microphone"
          description="Select the device StayFree should listen to."
          className="microphone-card"
        >
          <DevicePicker
            value={selectedMic}
            options={microphones}
            onChange={handleMicChange}
          />
        </SettingsCard>

        <SettingsCard
          icon={<SoundIcon />}
          eyebrow="Feedback"
          title="Sound effects"
          description="Hear a short cue when recording starts and stops."
          className="sound-card"
        >
          <div className="setting-control-row">
            <div>
              <strong>{soundEnabled ? "Sounds are on" : "Sounds are off"}</strong>
              <span>
                {soundEnabled
                  ? "You will hear start and stop cues."
                  : "StayFree will remain silent."}
              </span>
            </div>
            <button
              className={soundEnabled ? "settings-toggle is-on" : "settings-toggle"}
              onClick={handleSoundToggle}
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Sound effects"
            >
              <span />
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={<InfoIcon />}
          eyebrow="App"
          title="Quick reference"
          description="The essentials for dictating on this computer."
          className="about-card"
        >
          <dl className="quick-reference">
            <div>
              <dt>Platform</dt>
              <dd>{platformLabel}</dd>
            </div>
            <div>
              <dt>Push to talk</dt>
              <dd>
                <kbd>{hotkeyLabel}</kbd>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className="ready-status">
                <span />
                Ready
              </dd>
            </div>
          </dl>
        </SettingsCard>
      </div>
    </div>
  );
}
