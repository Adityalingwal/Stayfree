import { randomUUID } from "crypto";
import store, { Note, TranscriptionEntry } from "./store";

const MAX_NOTES = 500;

function autoTitle(content: string): string {
  const firstLine = content.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
}

export function createNote(params: {
  content: string;
  rawContent?: string;
  source: Note["source"];
  title?: string;
}): Note {
  const now = Date.now();
  const note: Note = {
    id: randomUUID(),
    title: params.title ?? autoTitle(params.content),
    content: params.content,
    rawContent: params.rawContent ?? params.content,
    createdAt: now,
    updatedAt: now,
    source: params.source,
    pinned: false,
    archived: false,
    tags: [],
  };

  const notes = store.get("notes") as Note[];
  notes.unshift(note);
  if (notes.length > MAX_NOTES) {
    notes.splice(MAX_NOTES);
  }
  store.set("notes", notes);
  return note;
}

export function updateNote(
  id: string,
  updates: Partial<Pick<Note, "title" | "content" | "pinned" | "archived" | "tags">>,
): Note | null {
  const notes = store.get("notes") as Note[];
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;

  const updated: Note = { ...notes[idx], ...updates, updatedAt: Date.now() };
  notes[idx] = updated;
  store.set("notes", notes);
  return updated;
}

export function deleteNote(id: string): boolean {
  const notes = store.get("notes") as Note[];
  const filtered = notes.filter((n) => n.id !== id);
  if (filtered.length === notes.length) return false;
  store.set("notes", filtered);
  return true;
}

export function getNotes(opts?: { includeArchived?: boolean }): Note[] {
  const notes = store.get("notes") as Note[];
  if (opts?.includeArchived) return notes;
  return notes.filter((n) => !n.archived);
}

export function searchNotes(query: string): Note[] {
  const lower = query.toLowerCase();
  const notes = store.get("notes") as Note[];
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(lower) ||
      n.content.toLowerCase().includes(lower) ||
      n.tags.some((t) => t.toLowerCase().includes(lower)),
  );
}

export function promoteTranscriptionToNote(entry: TranscriptionEntry): Note {
  return createNote({
    content: entry.text,
    rawContent: entry.rawText,
    source: "transcription",
  });
}

export function createNoteFromClipboard(clipboardText: string): Note {
  return createNote({
    content: clipboardText,
    source: "clipboard",
  });
}
