import Store from "electron-store";

/**
 * Settings Store
 * Persists user settings (API key, hotkey config, dictionary, etc.)
 */

interface StoreSchema {
  groqApiKey: string;
  hotkey: {
    useFnKey: boolean;
    fnKeyCode: number;
    keys: number[];
  };
  dictionary: Record<string, string>; // term -> replacement
  lastTranscript: string;
}

const store = new Store<StoreSchema>({
  defaults: {
    groqApiKey: "",
    hotkey: {
      useFnKey: false,
      fnKeyCode: 56, // Left Option/Alt
      keys: [56],
    },
    dictionary: {},
    lastTranscript: "",
  },
});

export default store;
