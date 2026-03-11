export type CommandType = "save-note" | "save-clipboard" | "open-notes" | "unknown";

export interface CommandResult {
  type: CommandType;
  content?: string;
}

const SAVE_NOTE_PREFIX = /^(?:save to notes|save this to notes|save as note|note)\s*[:.]?\s*(.+)/i;
const SAVE_NOTE_SUFFIX = /^(.*?)\s*(?:save to notes|save this as a note|save as note)[.!]?$/i;
const SAVE_CLIPBOARD = /save clipboard to notes|clipboard.*notes|clipboard save/i;
const OPEN_NOTES = /open notes|show notes|notes dikhao|show my notes/i;

export function parseCommand(transcript: string): CommandResult {
  const t = transcript.trim();

  // 1. Save clipboard — check BEFORE save-note prefix (both start with "save")
  if (SAVE_CLIPBOARD.test(t)) {
    return { type: "save-clipboard" };
  }

  // 2. Open notes
  if (OPEN_NOTES.test(t)) {
    return { type: "open-notes" };
  }

  // 3. "save to notes <content>" prefix pattern (capture group 1)
  const prefixMatch = SAVE_NOTE_PREFIX.exec(t);
  if (prefixMatch) {
    const content = prefixMatch[1]?.trim() ?? "";
    return { type: "save-note", content: content || t };
  }

  // 4. "<content> save to notes" suffix pattern
  const suffixMatch = SAVE_NOTE_SUFFIX.exec(t);
  if (suffixMatch) {
    const content = suffixMatch[1]?.trim() ?? "";
    return { type: "save-note", content: content || t };
  }

  return { type: "unknown" };
}
