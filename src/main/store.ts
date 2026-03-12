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

export type StylePreset =
  | "default"
  | "bullets"
  | "action-items"
  | "casual-memo"
  | "formal-doc"
  | "tweet-thread";

export interface ExtractedTask {
  person: string;   // "Me", "John", etc.
  action: string;   // "Send the report"
  deadline: string; // "by Friday", "ASAP", "unspecified"
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
  tags: string[];
  // Phase 2 additions
  cleanContent: string;     // AI-cleaned version ("" until processed)
  aiProcessed: boolean;     // true after cleanup+tagging completes
  aiProcessing: boolean;    // true while background AI is running
  stylePreset: StylePreset; // current style applied
  styledContent: string;    // content reformatted to selected style ("" until requested)
  suggestedTags: string[];  // AI-suggested tags (user can approve/remove)
  tasks: ExtractedTask[];   // AI-extracted action items
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
