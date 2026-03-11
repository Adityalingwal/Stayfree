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

export interface Note {
  id: string;              // crypto.randomUUID()
  title: string;           // Auto-generated from first ~60 chars, user-editable
  content: string;         // Note text (formatted for voice, raw for text/clipboard)
  rawContent: string;      // Original raw transcription before any formatting
  createdAt: number;       // Date.now()
  updatedAt: number;       // Date.now()
  source: "voice" | "text" | "clipboard" | "transcription";
  pinned: boolean;
  archived: boolean;
  tags: string[];          // Empty in Phase 1, auto-tagged in Phase 2
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
  notes: Note[];
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
    notes: [],
  },
});

export default store;
