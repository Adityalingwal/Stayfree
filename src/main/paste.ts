import {
  clipboard,
  systemPreferences,
  Notification,
  dialog,
  shell,
} from "electron";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { isMac, isWindows, pasteShortcutLabel } from "./platform";

/**
 * Paste Service (nut-js powered)
 *
 * Using nut-js for native keyboard automation:
 * - Cross-platform support (macOS, Windows, Linux)
 * - Native C++ performance: 10-20ms latency
 * - Zero configuration overhead, direct system APIs
 */

// Configure nut-js for ZERO delays (default has 300ms delays!)
keyboard.config.autoDelayMs = 0; // Remove delay between key actions

// Cache accessibility permission to avoid repeated checks
let accessibilityGranted: boolean | null = null;

export function checkAccessibilityPermission(): boolean {
  if (!isMac) return true;

  // Use cached value if available
  if (accessibilityGranted !== null) {
    return accessibilityGranted;
  }

  // false = don't prompt, just check
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  accessibilityGranted = trusted; // Cache it!

  console.log(
    `[Paste] Accessibility permission: ${trusted ? "granted" : "DENIED"}`,
  );
  return trusted;
}

export function requestAccessibilityPermission(): void {
  if (!isMac) return;

  // true = prompt the system dialog
  systemPreferences.isTrustedAccessibilityClient(true);

  // Also show our own dialog pointing user to the right place
  dialog
    .showMessageBox({
      type: "info",
      title: "Accessibility Permission Required",
      message: "StayFree needs Accessibility permission to paste text.",
      detail:
        "Please go to System Settings → Privacy & Security → Accessibility and enable StayFree (or Electron).\n\nAfter enabling, restart the app.",
      buttons: ["Open System Settings", "Later"],
    })
    .then(({ response }) => {
      if (response === 0) {
        shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        );
      }
    });
}

export function writeToClipboard(text: string): void {
  clipboard.writeText(text);
  console.log(
    `[Paste] Wrote to clipboard: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
  );
}

async function simulatePaste(): Promise<boolean> {
  try {
    const modifier = isMac ? Key.LeftCmd : Key.LeftControl;
    // Use nut-js native keyboard automation with zero delays
    await keyboard.pressKey(modifier);
    await keyboard.pressKey(Key.V);
    await keyboard.releaseKey(Key.V);
    await keyboard.releaseKey(modifier);
    return true;
  } catch (error) {
    console.error("[Paste] nut-js failed:", error);
    return false;
  }
}

export async function pasteText(text: string): Promise<boolean> {
  const startPaste = Date.now();

  // Check accessibility permission (cached after first check)
  if (!checkAccessibilityPermission()) {
    console.error(
      "[Paste] Cannot paste - Accessibility permission not granted",
    );
    requestAccessibilityPermission();
    showPasteFailedNotification();
    return false;
  }

  writeToClipboard(text);

  // Reduced delay from 10ms to 5ms
  await new Promise((resolve) => setTimeout(resolve, 5));

  // Simulate platform paste shortcut
  const success = await simulatePaste();

  const pasteLatency = Date.now() - startPaste;

  if (success) {
    console.log(`[Paste] ✓ Text pasted successfully (${pasteLatency}ms)`);
  } else {
    console.error("[Paste] ✗ Paste failed");
    showPasteFailedNotification();
  }

  return success;
}

function showPasteFailedNotification(): void {
  const fallbackPasteShortcut = isMac ? "Cmd+Shift+V" : "Ctrl+Shift+V";
  new Notification({
    title: "StayFree",
    body: `Paste failed. Press ${fallbackPasteShortcut} or ${pasteShortcutLabel} to paste manually.`,
    silent: true,
  }).show();
}
