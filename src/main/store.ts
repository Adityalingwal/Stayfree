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
}

interface StoreSchema {
  groqApiKey: string;
  sarvamApiKey: string; // NEW: Sarvam AI API key
  languagePreference: "english" | "hindi"; // NEW: Language mode
  hotkey: {
    useFnKey: boolean;
    fnKeyCode: number;
    keys: number[];
  };
  dictionary: Record<string, string>; // term -> replacement
  lastTranscript: string;
  onboardingComplete: boolean;
  selectedMicId: string; // '' = system default
  transcriptionHistory: TranscriptionEntry[];
  soundEnabled: boolean;
}

const store = new Store<StoreSchema>({
  defaults: {
    groqApiKey: "",
    sarvamApiKey: "", // NEW
    languagePreference: "english", // NEW: Default to English
    hotkey: {
      useFnKey: false,
      fnKeyCode: 56, // Left Option/Alt
      keys: [56],
    },
    dictionary: {},
    lastTranscript: "",
    onboardingComplete: false,
    selectedMicId: "",
    transcriptionHistory: [],
    soundEnabled: true,
  },
});

export default store;
