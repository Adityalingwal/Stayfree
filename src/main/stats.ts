/**
 * Speaking statistics — pure helpers, no Electron imports.
 *
 * WPM is computed ONLY from `dailyStats`, whose word and speaking-time
 * counters are accumulated together per recording. `totalWordsSpoken`
 * predates speaking-time tracking (it was seeded from old history), so
 * dividing it by the newer speaking time would produce absurd WPM values —
 * never mix the two.
 */

/** Per-day aggregate of dictation activity. Keyed by LOCAL date "YYYY-MM-DD". */
export interface DayStats {
  words: number;
  speakingMs: number;
}

export interface InsightsStats {
  /** Lifetime word count (includes pre-tracking history). */
  totalWords: number;
  /** Weighted words-per-minute over all tracked speech; null until enough data. */
  wpm: number | null;
  /** Total tracked speaking time in ms. */
  speakingMs: number;
  /** Words spoken since speaking-time tracking began (WPM numerator). */
  trackedWords: number;
  /** Words spoken today (local time). */
  todayWords: number;
}

/** Below this much tracked speech, WPM is statistically meaningless. */
const MIN_SPEAKING_MS_FOR_WPM = 5000;

/**
 * Local-time date key ("YYYY-MM-DD"). Deliberately NOT toISOString(), which
 * is UTC and would roll days over at the wrong moment for the user.
 */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The single word-tokenization rule. Every counter (totalWordsSpoken,
 * dailyStats, history seeding) must go through this so they can never drift.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isValidDayStats(value: unknown): value is DayStats {
  if (typeof value !== "object" || value === null) return false;
  const { words, speakingMs } = value as Record<string, unknown>;
  return (
    typeof words === "number" &&
    Number.isFinite(words) &&
    words >= 0 &&
    typeof speakingMs === "number" &&
    Number.isFinite(speakingMs) &&
    speakingMs >= 0
  );
}

export function computeInsightsStats(
  totalWordsSpoken: number,
  dailyStats: Record<string, DayStats>,
  now: number = Date.now(),
): InsightsStats {
  let trackedWords = 0;
  let speakingMs = 0;

  for (const day of Object.values(dailyStats ?? {})) {
    // The on-disk store is plain JSON a user can hand-edit — skip anything
    // malformed rather than letting one bad entry NaN every stat.
    if (!isValidDayStats(day)) continue;
    trackedWords += day.words;
    speakingMs += day.speakingMs;
  }

  const wpm =
    speakingMs >= MIN_SPEAKING_MS_FOR_WPM
      ? Math.round(trackedWords / (speakingMs / 60000))
      : null;

  const today = dailyStats?.[localDateKey(now)];

  return {
    totalWords: Number.isFinite(totalWordsSpoken) ? totalWordsSpoken : 0,
    wpm,
    speakingMs,
    trackedWords,
    todayWords: isValidDayStats(today) ? today.words : 0,
  };
}
