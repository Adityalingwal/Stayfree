import { ipcMain } from "electron";
import store from "../store";
import { handleChatQuery } from "../chat";

export function registerChatHandlers(): void {
  ipcMain.handle("chat-query", (_event, question: string) => {
    return handleChatQuery(question);
  });

  ipcMain.handle("get-chat-history", () => {
    return store.get("chatHistory");
  });

  ipcMain.on("clear-chat-history", () => {
    store.set("chatHistory", []);
  });
}
