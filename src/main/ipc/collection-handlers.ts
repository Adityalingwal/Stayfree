import { ipcMain } from "electron";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  getCollections,
  addNoteToCollection,
  removeNoteFromCollection,
  mergeCollections,
  dismissCollection,
  suggestCollections,
} from "../collections";

export function registerCollectionHandlers(): void {
  ipcMain.handle("get-collections", () => getCollections());

  ipcMain.handle("create-collection", (_event, params: { name: string; description?: string; noteIds?: string[] }) => {
    return createCollection(params);
  });

  ipcMain.handle("update-collection", (_event, id: string, updates: Record<string, unknown>) => {
    return updateCollection(id, updates as Parameters<typeof updateCollection>[1]);
  });

  ipcMain.handle("delete-collection", (_event, id: string) => {
    return deleteCollection(id);
  });

  ipcMain.handle("add-note-to-collection", (_event, collectionId: string, noteId: string) => {
    return addNoteToCollection(collectionId, noteId);
  });

  ipcMain.handle("remove-note-from-collection", (_event, collectionId: string, noteId: string) => {
    return removeNoteFromCollection(collectionId, noteId);
  });

  ipcMain.handle("merge-collections", (_event, sourceId: string, targetId: string) => {
    return mergeCollections(sourceId, targetId);
  });

  ipcMain.on("dismiss-collection", (_event, id: string) => {
    dismissCollection(id);
  });

  ipcMain.handle("suggest-collections", () => {
    return suggestCollections();
  });
}
