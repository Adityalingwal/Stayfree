import {
  clipboard,
  systemPreferences,
  Notification,
  dialog,
  shell,
} from "electron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Paste Service
 *
 * Design decisions (per Phase 6 spec):
 * - NO clipboard save/restore - spoken text stays in clipboard intentionally
 * - User can re-paste with Cmd+V or Ctrl+Cmd+V fallback at any time
 * - Minimal latency: ~30-50ms for paste simulation
 */

export function checkAccessibilityPermission(): boolean {
  if (process.platform !== "darwin") return true;

  // false = don't prompt, just check
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  console.log(
    `[Paste] Accessibility permission: ${trusted ? "granted" : "DENIED"}`,
  );
  return trusted;
}

export function requestAccessibilityPermission(): void {
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
    // Use osascript to simulate Cmd+V into the currently focused app
    await execAsync(
      'osascript -e "tell application \\"System Events\\" to keystroke \\"v\\" using command down"',
    );
    return true;
  } catch (error) {
    console.error("[Paste] osascript failed:", error);
    return false;
  }
}

export async function pasteText(text: string): Promise<boolean> {
  // Check accessibility permission first
  if (!checkAccessibilityPermission()) {
    console.error(
      "[Paste] Cannot paste - Accessibility permission not granted",
    );
    requestAccessibilityPermission();
    showPasteFailedNotification();
    return false;
  }

  writeToClipboard(text);

  // Minimal delay - writeText is sync but tiny buffer for safety
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Simulate Cmd+V
  const success = await simulatePaste();

  if (success) {
    console.log("[Paste] ✓ Text pasted successfully");
  } else {
    console.error("[Paste] ✗ Paste failed");
    showPasteFailedNotification();
  }

  return success;
}

function showPasteFailedNotification(): void {
  new Notification({
    title: "StayFree",
    body: "Paste failed. Press Ctrl+Cmd+V or just Cmd+V to paste manually.",
    silent: true,
  }).show();
}
