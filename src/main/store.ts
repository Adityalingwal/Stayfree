import Store from "electron-store";

/**
 * Settings Store
 * Persists user settings (API key, hotkey config, dictionary, etc.)
 */

export interface TranscriptionEntry {
  text: string;
  rawText: string;
  timestamp: number;
  durationMs: number;
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

export default store;
