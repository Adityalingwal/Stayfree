import React, { useState, useEffect, useCallback } from "react";

interface InsightsStats {
  totalWords: number;
  wpm: number | null;
  speakingMs: number;
  trackedWords: number;
  todayWords: number;
}

const WORDS_PER_BOOK = 80000;
/** Gauge tops out here — 200+ wpm is exceptional pace for dictation. */
const GAUGE_MAX_WPM = 200;

function formatWholeNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatSpeakingTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function bookProgressLine(totalWords: number): string {
  const books = Math.floor(totalWords / WORDS_PER_BOOK);
  if (books >= 1) {
    return `You've written ${books} complete book${books > 1 ? "s" : ""}!`;
  }
  const percent = (totalWords / WORDS_PER_BOOK) * 100;
  return `You've written ${percent < 10 ? percent.toFixed(1) : Math.round(percent)}% of a book`;
}

// ─── Semicircular WPM gauge ────────────────────────────────────
// Pure inline SVG. Track semicircle + progress arc via stroke-dasharray;
// the wpm number sits in the center. Radius 80 → arc length = π·80.
const GAUGE_ARC_LENGTH = Math.PI * 80;

function WpmGauge({ wpm }: { wpm: number | null }) {
  const progress =
    wpm === null ? 0 : Math.min(wpm, GAUGE_MAX_WPM) / GAUGE_MAX_WPM;

  return (
    <svg
      viewBox="0 0 200 112"
      width="180"
      height="101"
      role="img"
      aria-label={wpm === null ? "Words per minute not available yet" : `${wpm} words per minute`}
      style={{ display: "block", margin: "4px auto 0" }}
    >
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="14"
        strokeLinecap="round"
      />
      {progress > 0 && (
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#0f172a"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${progress * GAUGE_ARC_LENGTH} ${GAUGE_ARC_LENGTH}`}
          style={{
            transition: "stroke-dasharray 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      )}
      <text
        x="100"
        y="92"
        textAnchor="middle"
        style={{
          fontSize: "40px",
          fontWeight: 700,
          fill: "#0f172a",
          fontFamily: "Georgia, 'Times New Roman', serif",
          letterSpacing: "-0.02em",
        }}
      >
        {wpm === null ? "—" : wpm}
      </text>
    </svg>
  );
}

// ─── Stat card shell ───────────────────────────────────────────
function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: "1px solid #f1f5f9",
        borderRadius: "14px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "180px",
      }}
    >
      {children}
    </div>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}
    >
      {children}
    </div>
  );
}

function StatNumber({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "40px",
        fontWeight: 700,
        color: "#0f172a",
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
        fontFamily: "Georgia, 'Times New Roman', serif",
        margin: "10px 0 6px",
      }}
    >
      {children}
    </div>
  );
}

export default function InsightsPage() {
  const [stats, setStats] = useState<InsightsStats | null>(null);

  const refreshStats = useCallback(() => {
    window.electron.getInsightsStats().then(setStats);
  }, []);

  useEffect(() => {
    refreshStats();
    // Re-fetch after every completed dictation
    const cleanup = window.electron.onTranscriptionHistoryUpdated?.(() => {
      refreshStats();
    });
    return () => cleanup?.();
  }, [refreshStats]);

  return (
    <div>
      <h1
        style={{
          fontSize: "30px",
          fontWeight: 700,
          color: "#0f172a",
          margin: "0 0 28px 0",
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        Insights
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {/* ─── WPM ─── */}
        <StatCard>
          <StatLabel>Words per minute</StatLabel>
          <WpmGauge wpm={stats?.wpm ?? null} />
          <div
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              textAlign: "center",
              marginTop: "8px",
            }}
          >
            {stats?.wpm === null || stats === null
              ? "not enough data yet"
              : "your average speaking pace"}
          </div>
        </StatCard>

        {/* ─── Total words ─── */}
        <StatCard>
          <StatLabel>Total words dictated</StatLabel>
          <div>
            <StatNumber>
              {stats ? formatWholeNumber(stats.totalWords) : "…"}
            </StatNumber>
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              {stats ? bookProgressLine(stats.totalWords) : ""}
            </div>
          </div>
        </StatCard>

        {/* ─── Speaking time ─── */}
        <StatCard>
          <StatLabel>Speaking time</StatLabel>
          <div>
            <StatNumber>
              {stats ? formatSpeakingTime(stats.speakingMs) : "…"}
            </StatNumber>
            <div style={{ fontSize: "13px", color: "#64748b" }}>
              time spent dictating
            </div>
          </div>
        </StatCard>
      </div>

      {/* Only while WPM has too little data to be meaningful */}
      {stats !== null && stats.wpm === null && (
        <p
          style={{
            fontSize: "13px",
            color: "#94a3b8",
            marginTop: "20px",
            textAlign: "center",
          }}
        >
          Speak a little more to unlock your words-per-minute — tracking starts
          with your next dictation.
        </p>
      )}
    </div>
  );
}
