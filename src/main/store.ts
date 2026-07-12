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
  sarvamApiKey: string; // Sarvam AI API key
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
    sarvamApiKey: "",
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

export default store;
