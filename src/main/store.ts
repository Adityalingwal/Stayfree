import Store from "electron-store";
import { countWords, type DayStats } from "./stats";

/**
 * Settings Store
 * Persists user settings and app data: hotkey config, selected mic,
 * sound toggle, onboarding flag, last transcript, and the transcription
 * history (capped at 50). No credentials — the legacy Sarvam API key was
 * removed (see purgeLegacySarvamApiKey below).
 */

export interface TranscriptionEntry {
  text: string;
  rawText: string;
  timestamp: number;
  /** Pipeline processing time (ASR + save) — NOT speaking time. */
  durationMs: number;
  /**
   * Actual speaking duration, derived from the captured PCM byte count.
   * Optional: entries recorded before this field existed lack it, and it
   * cannot be backfilled — WPM only counts entries that have it.
   */
  audioMs?: number;
  audioFilePath?: string;
}

interface StoreSchema {
  hotkey: {
    useFnKey: boolean;
    fnKeyCode: number;
    keys: number[];
  };
  lastTranscript: string;
  onboardingComplete: boolean;
  selectedMicId: string; // '' = system default
  transcriptionHistory: TranscriptionEntry[];
  soundEnabled: boolean;
  /**
   * Cumulative total of all words ever spoken — persists even when
   * transcriptionHistory entries are pruned (50-entry cap). Never decreases.
   */
  totalWordsSpoken: number;
  /**
   * Per-day words + speaking time, keyed by LOCAL date "YYYY-MM-DD".
   * Both counters accrue together per recording, which is what makes them
   * safe to divide for WPM (unlike totalWordsSpoken, which predates
   * speaking-time tracking). Survives history clears, like totalWordsSpoken.
   */
  dailyStats: Record<string, DayStats>;
}

const store = new Store<StoreSchema>({
  defaults: {
    hotkey: {
      useFnKey: false,
      fnKeyCode: 56, // Left Option/Alt
      keys: [56],
    },
    lastTranscript: "",
    onboardingComplete: false,
    selectedMicId: "",
    transcriptionHistory: [],
    soundEnabled: true,
    totalWordsSpoken: 0,
    dailyStats: {},
  },
});

/**
 * One-time credential purge (D8). `sarvamApiKey` was removed from
 * StoreSchema above, but electron-store persists to disk as plain JSON —
 * removing a field from the TS schema does NOT delete an already-saved
 * value, it would sit in the user's on-disk store forever. `.delete()` on
 * a key outside the current schema needs a cast since electron-store's
 * types only allow schema keys; idempotent (a no-op once the key is gone).
 * Call once at app startup.
 */
export function purgeLegacySarvamApiKey(): void {
  (store as unknown as { delete: (key: string) => void }).delete(
    "sarvamApiKey",
  );
}

/**
 * One-time migration: seed `totalWordsSpoken` from existing transcription
 * history for users who had recordings before this field was introduced.
 *
 * Detection logic:
 *   - If totalWordsSpoken > 0  → already seeded, skip (idempotent).
 *   - If history is empty      → brand-new user, nothing to seed.
 *   - Otherwise               → first run after upgrade; count words from
 *                               every history entry and write the total.
 *
 * Call once at app startup, after purgeLegacySarvamApiKey().
 */
export function seedWordCountFromHistory(): void {
  const current = store.get("totalWordsSpoken");
  if (current > 0) return; // already seeded

  const history = store.get("transcriptionHistory") as TranscriptionEntry[];
  if (history.length === 0) return; // nothing to seed

  const seeded = history.reduce(
    (sum, entry) => sum + countWords(entry.text ?? ""),
    0,
  );

  store.set("totalWordsSpoken", seeded);
  console.log(
    `[Store] Seeded totalWordsSpoken=${seeded} from ${history.length} existing history entries.`,
  );
}

export default store;
