export const isMac = process.platform === "darwin";
export const isWindows = process.platform === "win32";

export const pasteModifierKey = isMac ? "cmd" : "ctrl";
export const settingsShortcut = "CommandOrControl+,";
export const quitShortcut = isMac ? "CommandOrControl+Q" : "Alt+F4";
export const fallbackPasteShortcut = "CommandOrControl+Shift+V";

export const holdKeyLabel = isMac ? "Option" : "Alt";
export const pasteShortcutLabel = isMac ? "Cmd+V" : "Ctrl+V";
