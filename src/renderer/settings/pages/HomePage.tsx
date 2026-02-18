import React, { useState, useEffect, useCallback } from "react";

interface TranscriptionEntry {
  text: string;
  rawText: string;
  timestamp: number;
  durationMs: number;
  audioFilePath?: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(
  entries: TranscriptionEntry[],
): Map<string, TranscriptionEntry[]> {
  const groups = new Map<string, TranscriptionEntry[]>();
  for (const entry of entries) {
    const key = formatDateLabel(entry.timestamp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return groups;
}

function computeStats(entries: TranscriptionEntry[]) {
  const totalWords = entries.reduce(
    (s, e) => s + e.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  const totalTranscriptions = entries.length;
  const avgDuration =
    entries.length > 0
      ? Math.round(
          entries.reduce((s, e) => s + e.durationMs, 0) / entries.length,
        )
      : 0;
  return { totalWords, totalTranscriptions, avgDuration };
}

// ─── Copy Button ───────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: copied ? "#16a34a" : "#cbd5e1",
        padding: "4px",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!copied)
          (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
      }}
      onMouseLeave={(e) => {
        if (!copied)
          (e.currentTarget as HTMLButtonElement).style.color = "#cbd5e1";
      }}
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function DownloadButton({ filename }: { filename?: string }) {
  const [status, setStatus] = useState<"idle" | "downloading" | "success">(
    "idle",
  );

  // No audio available — just hide the button
  if (!filename) return null;

  const handleDownload = async () => {
    setStatus("downloading");
    const success = await window.electron.downloadAudioFile(filename);
    if (success) {
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      setStatus("idle");
      alert("Failed to download audio file.");
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={status === "downloading"}
      title={status === "success" ? "Saved to Downloads!" : "Download Audio"}
      style={{
        background: "none",
        border: "none",
        cursor: status === "downloading" ? "wait" : "pointer",
        color: status === "success" ? "#16a34a" : "#cbd5e1",
        padding: "4px",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => {
        if (status === "idle")
          (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
      }}
      onMouseLeave={(e) => {
        if (status === "idle")
          (e.currentTarget as HTMLButtonElement).style.color = "#cbd5e1";
      }}
    >
      {status === "downloading" ? (
        <div
          style={{
            width: "14px",
            height: "14px",
            border: "2px solid #cbd5e1",
            borderTopColor: "#64748b",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      ) : status === "success" ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
    </button>
  );
}
export default function HomePage() {
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshHistory = () => {
    window.electron.getTranscriptionHistory().then((h) => {
      setHistory(h);
      setLoading(false);
    });
  };

  useEffect(() => {
    refreshHistory();

    // Auto-refresh when a new recording is saved
    const cleanup = window.electron.onTranscriptionHistoryUpdated?.(() => {
      refreshHistory();
    });
    return () => cleanup?.();
  }, []);

  const stats = computeStats(history);
  const grouped = groupByDate(history);

  return (
    <div>
      {/* ─── Header Row ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "28px",
        }}
      >
        <h1
          style={{
            fontSize: "30px",
            fontWeight: 700,
            color: "#0f172a",
            margin: 0,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          Welcome back
        </h1>

        {/* Stats (Wispr style inline) */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "14px" }}>🔥</span>
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
            >
              10 days
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "14px" }}>✏️</span>
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
            >
              {stats.totalWords >= 1000
                ? `${(stats.totalWords / 1000).toFixed(1)}K words`
                : `${stats.totalWords} words`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "14px" }}>🏆</span>
            <span
              style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}
            >
              {stats.totalTranscriptions} notes
            </span>
          </div>
        </div>
      </div>

      {/* ─── Feature Card (Wispr cream/warm) ─── */}
      <div
        style={{
          backgroundColor: "#fefce8",
          borderRadius: "14px",
          padding: "28px 32px",
          marginBottom: "36px",
          border: "1px solid #fef9c3",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#1c1917",
            margin: "0 0 8px 0",
            letterSpacing: "-0.02em",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          Hold{" "}
          <span
            style={{
              fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
              fontWeight: 800,
            }}
          >
            fn
          </span>{" "}
          to dictate and let StayFree format for you
        </h2>
        <p
          style={{
            color: "#57534e",
            fontSize: "14px",
            lineHeight: "1.6",
            maxWidth: "600px",
            margin: "0 0 16px 0",
          }}
        >
          Press and hold <strong>fn</strong> to dictate in any app. StayFree's{" "}
          <strong>Smart Formatting</strong> and <strong>Backtrack</strong> will
          handle punctuation, new lines, lists, and adjust when you change your
          mind mid-sentence.
        </p>
        <button
          style={{
            backgroundColor: "#1c1917",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "#000";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "#1c1917";
          }}
        >
          Show me how
        </button>
      </div>

      {/* ─── Transcription Feed ─── */}
      <div>
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "60px 0",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                border: "3px solid #e2e8f0",
                borderTopColor: "#0f172a",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </div>
        ) : history.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              border: "1px dashed #e2e8f0",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "4px",
              }}
            >
              No transcriptions yet
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
              Hold your hotkey (Fn) and start speaking!
            </p>
          </div>
        ) : (
          <div>
            {Array.from(grouped.entries()).map(([dateLabel, entries]) => (
              <div key={dateLabel} style={{ marginBottom: "28px" }}>
                <h3
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    margin: "0 0 10px 0",
                  }}
                >
                  {dateLabel}
                </h3>
                <div
                  style={{
                    border: "1px solid #f1f5f9",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  {entries.map((entry, i) => (
                    <TranscriptionRow
                      key={`${entry.timestamp}-${i}`}
                      entry={entry}
                      isFirst={i === 0}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Clear */}
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <button
                onClick={() => {
                  if (confirm("Clear all history?")) {
                    window.electron.clearTranscriptionHistory();
                    setHistory([]);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#cbd5e1",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "#ef4444";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "#cbd5e1";
                }}
              >
                Clear history
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Transcription Row ─────────────────────────────────────────
function TranscriptionRow({
  entry,
  isFirst,
}: {
  entry: TranscriptionEntry;
  isFirst: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "24px",
        padding: "16px 20px",
        backgroundColor: hovered ? "#fafbfc" : "#fff",
        borderTop: isFirst ? "none" : "1px solid #f1f5f9",
        transition: "background-color 0.15s ease",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 500,
          color: "#94a3b8",
          minWidth: "72px",
          flexShrink: 0,
          paddingTop: "1px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatTime(entry.timestamp)}
      </span>
      <p
        style={{
          flex: 1,
          fontSize: "14px",
          lineHeight: "1.7",
          color: "#334155",
          margin: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        {entry.text}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      >
        <CopyButton text={entry.text} />
        <DownloadButton filename={entry.audioFilePath} />
      </div>
    </div>
  );
}
