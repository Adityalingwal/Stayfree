import { EventEmitter } from "events";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { isMac } from "./platform";

/**
 * Hotkey Manager
 *
 * Push-to-talk: hold key to record, release to stop.
 * Emits 'recording-start' on keydown, 'recording-stop' on keyup.
 *
 * macOS: Option (Alt) key
 * Windows: Ctrl key — Alt avoided because Windows OS intercepts Alt keyup for menu bar activation
 */

export interface HotkeyConfig {
  keys: number[]; // Key codes to hold for push-to-talk
}

export class HotkeyManager extends EventEmitter {
  private pressedKeys = new Set<number>();
  private isRecording = false;
  private config: HotkeyConfig;

  constructor(config?: Partial<HotkeyConfig>) {
    super();

    // Mac: Option (Alt) key — reliable keyup events
    // Windows: Ctrl key — Alt is unreliable on Windows (OS intercepts keyup for menu bar activation)
    const defaultHoldKey = isMac ? UiohookKey.Alt : UiohookKey.Ctrl;
    this.config = {
      keys: [defaultHoldKey],
      ...config,
    };
  }

  start(): void {
    console.log("[Hotkey] Starting hotkey listener...");
    console.log(
      `[Hotkey] Mode: Left ${isMac ? "Option" : "Ctrl"} key - HOLD to record, RELEASE to stop`,
    );

    uIOhook.on("keydown", (event) => {
      this.handleKeyDown(event.keycode);
    });

    uIOhook.on("keyup", (event) => {
      this.handleKeyUp(event.keycode);
    });

    // Start the hook
    uIOhook.start();
    console.log("[Hotkey] Listener started");
  }

  stop(): void {
    console.log("[Hotkey] Stopping hotkey listener...");
    uIOhook.stop();
    this.pressedKeys.clear();
    this.isRecording = false;
  }

  private handleKeyDown(keycode: number): void {
    // Ignore key-repeat events (already pressed)
    if (this.pressedKeys.has(keycode)) {
      return;
    }

    this.pressedKeys.add(keycode);

    if (this.isHotkeyComboPressed() && !this.isRecording) {
      this.isRecording = true;
      console.log("[Hotkey] Recording started");
      this.emit("recording-start");
    }
  }

  private handleKeyUp(keycode: number): void {
    this.pressedKeys.delete(keycode);

    // If we were recording and the hotkey is no longer pressed, stop
    if (this.isRecording && !this.isHotkeyComboPressed()) {
      this.isRecording = false;
      console.log("[Hotkey] Recording stopped");
      this.emit("recording-stop");
    }
  }

  private isHotkeyComboPressed(): boolean {
    // Check if ALL keys in the combo are currently pressed
    return this.config.keys.every((key) => this.pressedKeys.has(key));
  }

  // Allow changing hotkey config at runtime
  setConfig(config: Partial<HotkeyConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[Hotkey] Config updated: keys=${this.config.keys.join("+")}`);
  }

  getConfig(): HotkeyConfig {
    return { ...this.config };
  }
}

// Singleton instance
let hotkeyManagerInstance: HotkeyManager | null = null;

export function getHotkeyManager(
  config?: Partial<HotkeyConfig>,
): HotkeyManager {
  if (!hotkeyManagerInstance) {
    hotkeyManagerInstance = new HotkeyManager(config);
  }
  return hotkeyManagerInstance;
}
