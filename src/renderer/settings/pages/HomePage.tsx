import React, { useState, useEffect, useCallback } from "react";

interface TranscriptionEntry {
  text: string;
  rawText: string;
  timestamp: number;
  durationMs: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupByDate(
  entries: TranscriptionEntry[],
): Map<string, TranscriptionEntry[]> {
  const groups = new Map<string, TranscriptionEntry[]>();
  for (const entry of entries) {
    const key = formatDate(entry.timestamp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return groups;
}

function computeStats(entries: TranscriptionEntry[]) {
  const totalWords = entries.reduce(
    (sum, e) => sum + e.text.split(/\s+/).filter(Boolean).length,
    0,
  );
  const totalTranscriptions = entries.length;
  const avgDuration =
    entries.length > 0
      ? Math.round(
          entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length,
        )
      : 0;
  return { totalWords, totalTranscriptions, avgDuration };
}

/** Copy button with clipboard icon → checkmark feedback */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older Electron versions
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy text"}
      className="flex-shrink-0 p-1 rounded-md transition-all duration-200 hover:bg-gray-100 active:scale-90"
      style={{
        color: copied ? "#22c55e" : "#9ca3af",
        cursor: "pointer",
        border: "none",
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        if (!copied)
          (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6";
      }}
      onMouseLeave={(e) => {
        if (!copied)
          (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
      }}
    >
      {copied ? (
        /* Checkmark icon */
        <svg
          width="16"
          height="16"
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
        /* Clipboard/copy icon */
        <svg
          width="16"
          height="16"
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

export default function HomePage() {
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electron.getTranscriptionHistory().then((h) => {
      setHistory(h);
      setLoading(false);
    });
  }, []);

  const stats = computeStats(history);
  const grouped = groupByDate(history);

  return (
    <div>
      {/* Welcome */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Welcome to StayFree
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Hold your hotkey to dictate, release to paste.
      </p>

      {/* Stats Bar */}
      <div className="flex gap-6 mb-8">
        <div className="bg-white rounded-xl px-5 py-3 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
            Transcriptions
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {stats.totalTranscriptions}
          </p>
        </div>
        <div className="bg-white rounded-xl px-5 py-3 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
            Words
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {stats.totalWords.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl px-5 py-3 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
            Avg Speed
          </p>
          <p className="text-xl font-semibold text-gray-900">
            {stats.avgDuration > 0
              ? `${(stats.avgDuration / 1000).toFixed(1)}s`
              : "-"}
          </p>
        </div>
      </div>

      {/* Feature Card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Hold{" "}
          <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-sm">
            fn
          </span>{" "}
          to dictate
        </h2>
        <p className="text-sm text-gray-600">
          Press and hold your hotkey to dictate in any app. StayFree will handle
          punctuation, formatting, and voice commands like "new line" and
          "period" automatically.
        </p>
      </div>

      {/* History */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : history.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No transcriptions yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Hold your hotkey and start speaking!
          </p>
        </div>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([dateLabel, entries]) => (
            <div key={dateLabel} className="mb-6">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {dateLabel}
              </h3>
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="bg-white rounded-lg px-4 py-3 border border-gray-200 flex items-center gap-4"
                  >
                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </span>
                    <p className="text-sm text-gray-700 flex-1 whitespace-pre-wrap">
                      {entry.text}
                    </p>
                    <span className="text-xs text-gray-300 whitespace-nowrap">
                      {(entry.durationMs / 1000).toFixed(1)}s
                    </span>
                    <CopyButton text={entry.text} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Clear History */}
          <div className="text-center pt-4">
            <button
              onClick={() => {
                window.electron.clearTranscriptionHistory();
                setHistory([]);
              }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
