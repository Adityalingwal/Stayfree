import { ipcMain } from "electron";
import { TranscriptionEntry, StylePreset } from "../store";
import {
  createNote,
  deleteNote,
  getNotes,
  getRelatedNotes,
  promoteTranscriptionToNote,
  searchNotes,
  updateNote,
} from "../notes";
import { processNoteInBackground, applyStyle } from "../note-ai";

export interface NotesHandlerDeps {
  notifyNotesUpdated: () => void;
}

export function registerNotesHandlers(deps: NotesHandlerDeps): void {
  const { notifyNotesUpdated } = deps;

  ipcMain.handle("get-notes", () => {
    return getNotes();
  });

  ipcMain.handle("search-notes", (_event, query: string) => {
    return searchNotes(query);
  });

  ipcMain.handle(
    "create-note",
    (_event, params: { content: string; title?: string }) => {
      const note = createNote({ content: params.content, source: "text", title: params.title });
      notifyNotesUpdated();
      return note;
    },
  );

  ipcMain.handle(
    "update-note",
    (_event, id: string, updates: Record<string, unknown>) => {
      const note = updateNote(id, updates as Parameters<typeof updateNote>[1]);
      notifyNotesUpdated();
      return note;
    },
  );

  ipcMain.handle("delete-note", (_event, id: string) => {
    const result = deleteNote(id);
    notifyNotesUpdated();
    return result;
  });

  ipcMain.handle("promote-to-note", (_event, entry: TranscriptionEntry) => {
    const note = promoteTranscriptionToNote(entry);
    notifyNotesUpdated();
    processNoteInBackground(note.id, notifyNotesUpdated).catch((err) => {
      console.error("[NoteAI] Background processing failed:", err);
    });
    return note;
  });

  ipcMain.handle("restyle-note", async (_event, noteId: string, style: string) => {
    const notes = getNotes({ includeArchived: true });
    const note = notes.find((n) => n.id === noteId);
    if (!note) return null;
    const sourceContent = note.cleanContent || note.content;
    const styledContent = await applyStyle(sourceContent, style as StylePreset);
    const updated = updateNote(noteId, { stylePreset: style as StylePreset, styledContent });
    notifyNotesUpdated();
    return updated;
  });

  ipcMain.handle("approve-tag", (_event, noteId: string, tag: string) => {
    const notes = getNotes({ includeArchived: true });
    const note = notes.find((n) => n.id === noteId);
    if (!note) return null;
    const suggestedTags = note.suggestedTags.filter((t) => t !== tag);
    const tags = [...new Set([...note.tags, tag])];
    const updated = updateNote(noteId, { tags, suggestedTags });
    notifyNotesUpdated();
    return updated;
  });

  ipcMain.handle("remove-suggested-tag", (_event, noteId: string, tag: string) => {
    const notes = getNotes({ includeArchived: true });
    const note = notes.find((n) => n.id === noteId);
    if (!note) return null;
    const suggestedTags = note.suggestedTags.filter((t) => t !== tag);
    const updated = updateNote(noteId, { suggestedTags });
    notifyNotesUpdated();
    return updated;
  });

  ipcMain.handle("get-related-notes", (_event, noteId: string) => {
    return getRelatedNotes(noteId);
  });

  ipcMain.handle("reprocess-note", async (_event, noteId: string) => {
    updateNote(noteId, { aiProcessing: true, aiProcessed: false });
    notifyNotesUpdated();
    await processNoteInBackground(noteId, notifyNotesUpdated);
    return getNotes({ includeArchived: true }).find((n) => n.id === noteId) ?? null;
  });
}
