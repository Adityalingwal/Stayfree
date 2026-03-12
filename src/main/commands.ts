import { StylePreset } from "./store";

export type CommandType =
  | "save-note"
  | "save-clipboard"
  | "open-notes"
  | "restyle-note"
  | "unknown";

export interface CommandResult {
  type: CommandType;
  content?: string;
  style?: StylePreset;
}

const SAVE_NOTE_PREFIX = /^(?:save to notes|save this to notes|save as note|note)\s*[:.]?\s*(.+)/i;
const SAVE_NOTE_SUFFIX = /^(.*?)\s*(?:save to notes|save this as a note|save as note)[.!]?$/i;
const SAVE_CLIPBOARD = /save clipboard to notes|clipboard.*notes|clipboard save/i;
const OPEN_NOTES = /open notes|show notes|notes dikhao|show my notes/i;

// Style restyle patterns
const RESTYLE_BULLETS  = /(?:turn|convert|restyle|make|change).*(?:bullet|bullets|bullet points|bullet list)/i;
const RESTYLE_ACTIONS  = /(?:turn|convert|restyle|make|change|extract).*(?:action items|tasks|to-?do|action)/i;
const RESTYLE_CASUAL   = /(?:turn|convert|restyle|make|change).*(?:casual|email|memo|informal)/i;
const RESTYLE_FORMAL   = /(?:turn|convert|restyle|make|change).*(?:formal|document|technical|professional)/i;
const RESTYLE_TWEETS   = /(?:turn|convert|restyle|make|change).*(?:tweet|twitter|thread)/i;
const RESTYLE_DEFAULT  = /(?:turn|convert|restyle|make|change).*(?:default|clean|paragraph|normal)/i;

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

  // 3. Style restyle commands
  if (RESTYLE_BULLETS.test(t))  return { type: "restyle-note", style: "bullets" };
  if (RESTYLE_ACTIONS.test(t))  return { type: "restyle-note", style: "action-items" };
  if (RESTYLE_CASUAL.test(t))   return { type: "restyle-note", style: "casual-memo" };
  if (RESTYLE_FORMAL.test(t))   return { type: "restyle-note", style: "formal-doc" };
  if (RESTYLE_TWEETS.test(t))   return { type: "restyle-note", style: "tweet-thread" };
  if (RESTYLE_DEFAULT.test(t))  return { type: "restyle-note", style: "default" };

  // 4. "save to notes <content>" prefix pattern (capture group 1)
  const prefixMatch = SAVE_NOTE_PREFIX.exec(t);
  if (prefixMatch) {
    const content = prefixMatch[1]?.trim() ?? "";
    return { type: "save-note", content: content || t };
  }

  // 5. "<content> save to notes" suffix pattern
  const suffixMatch = SAVE_NOTE_SUFFIX.exec(t);
  if (suffixMatch) {
    const content = suffixMatch[1]?.trim() ?? "";
    return { type: "save-note", content: content || t };
  }

  return { type: "unknown" };
}
