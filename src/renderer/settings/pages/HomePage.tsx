import React, { useState, useEffect } from "react";

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
  entries: TranscriptionEntry[]
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
    0
  );
  const totalTranscriptions = entries.length;
  const avgDuration =
    entries.length > 0
      ? Math.round(
          entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length
        )
      : 0;
  return { totalWords, totalTranscriptions, avgDuration };
}

export default function HomePage() {
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electron
      .getTranscriptionHistory()
      .then((h) => {
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
          Hold <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-sm">fn</span> to dictate
        </h2>
        <p className="text-sm text-gray-600">
          Press and hold your hotkey to dictate in any app. StayFree will
          handle punctuation, formatting, and voice commands like "new line"
          and "period" automatically.
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
                    className="bg-white rounded-lg px-4 py-3 border border-gray-200 flex gap-4"
                  >
                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap pt-0.5">
                      {formatTime(entry.timestamp)}
                    </span>
                    <p className="text-sm text-gray-700 flex-1 whitespace-pre-wrap">
                      {entry.text}
                    </p>
                    <span className="text-xs text-gray-300 whitespace-nowrap pt-0.5">
                      {(entry.durationMs / 1000).toFixed(1)}s
                    </span>
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
