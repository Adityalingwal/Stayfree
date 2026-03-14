import { ipcMain } from "electron";
import {
  addStyleExample,
  removeStyleExample,
  getStyleConfig,
  generateStylePrompt,
} from "../style-training";

export function registerStyleHandlers(): void {
  ipcMain.on("add-style-example", (_event, text: string) => {
    addStyleExample(text);
  });

  ipcMain.on("remove-style-example", (_event, index: number) => {
    removeStyleExample(index);
  });

  ipcMain.handle("get-style-config", () => {
    return getStyleConfig();
  });

  ipcMain.handle("learn-style", async () => {
    const { examples } = getStyleConfig();
    return generateStylePrompt(examples);
  });
}
