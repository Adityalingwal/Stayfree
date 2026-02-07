import { EventEmitter } from "events";
import { uIOhook, UiohookKey } from "uiohook-napi";

/**
 * Hotkey Manager
 *
 * Detects Fn key press/release for push-to-talk functionality.
 * Emits 'recording-start' when Fn is pressed, 'recording-stop' when released.
 *
 * macOS Fn key: UiohookKey.Fn (keycode 63)
 * Fallback: Ctrl+Shift combo
 */

export interface HotkeyConfig {
  keys: number[]; // Key codes
  useFnKey: boolean; // if true, use Fn; if false, use keys combo
  fnKeyCode: number; // Fn key code (63 on macOS)
}

export class HotkeyManager extends EventEmitter {
  private pressedKeys = new Set<number>();
  private isRecording = false;
  private config: HotkeyConfig;

  constructor(config?: Partial<HotkeyConfig>) {
    super();

    // Default: Use Left Option (Alt) key for push-to-talk
    // Note: Fn key cannot be detected on macOS (hardware-level key)
    // Left Alt keycode = 56 on macOS
    this.config = {
      useFnKey: false, // Fn key doesn't work on macOS
      fnKeyCode: 56, // Left Option/Alt key instead
      keys: [56], // Left Option key (single key, not combo)
      ...config,
    };
  }

  start(): void {
    console.log("[Hotkey] Starting hotkey listener...");
    console.log(
      "[Hotkey] Mode: Left Option (Alt) key - HOLD to record, RELEASE to stop",
    );

    uIOhook.on("keydown", (event) => {
      // DEBUG: Log ALL key presses to see if uiohook is working
      console.log(`[Hotkey DEBUG] Key DOWN: keycode=${event.keycode}`);
      this.handleKeyDown(event.keycode);
    });

    uIOhook.on("keyup", (event) => {
      // DEBUG: Log ALL key releases
      console.log(`[Hotkey DEBUG] Key UP: keycode=${event.keycode}`);
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

    // Check if this triggers recording
    const shouldStartRecording = this.config.useFnKey
      ? keycode === this.config.fnKeyCode
      : this.isHotkeyComboPressed();

    if (shouldStartRecording && !this.isRecording) {
      this.isRecording = true;
      console.log("[Hotkey] Recording started");
      this.emit("recording-start");
    }
  }

  private handleKeyUp(keycode: number): void {
    this.pressedKeys.delete(keycode);

    // If we were recording and the hotkey is no longer pressed, stop
    if (this.isRecording) {
      const shouldStopRecording = this.config.useFnKey
        ? keycode === this.config.fnKeyCode
        : !this.isHotkeyComboPressed();

      if (shouldStopRecording) {
        this.isRecording = false;
        console.log("[Hotkey] Recording stopped");
        this.emit("recording-stop");
      }
    }
  }

  private isHotkeyComboPressed(): boolean {
    // Check if ALL keys in the combo are currently pressed
    return this.config.keys.every((key) => this.pressedKeys.has(key));
  }

  // Allow changing hotkey config at runtime
  setConfig(config: Partial<HotkeyConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(
      `[Hotkey] Config updated: ${this.config.useFnKey ? "Fn key" : `Combo: ${this.config.keys.join("+")}`}`,
    );
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
