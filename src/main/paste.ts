import {
  clipboard,
  systemPreferences,
  Notification,
  dialog,
  shell,
} from "electron";
import { keyboard, Key } from "@nut-tree-fork/nut-js";
import { isMac, isWindows } from "./platform";

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

interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage | null;
  hasContent: boolean;
}

function saveClipboard(): ClipboardSnapshot | null {
  const formats = clipboard.availableFormats();
  if (formats.length === 0) return null;

  const hasUnsupportedFormat = formats.some(
    (f) =>
      f.includes("file") ||
      f.includes("pdf") ||
      f.includes("url") ||
      f === "public.file-url" ||
      f === "NSFilenamesPboardType",
  );
  if (hasUnsupportedFormat) return null;

  const image = formats.some((f) => f.startsWith("image/"))
    ? clipboard.readImage()
    : null;

  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: image && !image.isEmpty() ? image : null,
    hasContent: true,
  };
}

function restoreClipboard(snapshot: ClipboardSnapshot | null): void {
  if (!snapshot || !snapshot.hasContent) return;

  const writeData: Electron.Data = {};
  if (snapshot.text) writeData.text = snapshot.text;
  if (snapshot.html) writeData.html = snapshot.html;
  if (snapshot.rtf) writeData.rtf = snapshot.rtf;
  if (snapshot.image) writeData.image = snapshot.image;

  if (Object.keys(writeData).length > 0) {
    clipboard.write(writeData);
  }
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

  const previousClipboard = saveClipboard();
  console.log(`[Paste] Previous clipboard text: "${clipboard.readText().substring(0, 30)}"`);

  writeToClipboard(text);
  console.log(`[Paste] Clipboard after write: "${clipboard.readText().substring(0, 30)}"`);

  await new Promise((resolve) => setTimeout(resolve, 5));

  const success = await simulatePaste();

  // Restore clipboard in background — don't block paste latency
  // 100ms gives OS enough time to complete the paste event
  setTimeout(() => {
    restoreClipboard(previousClipboard);
    console.log(`[Paste] Clipboard restored to: "${clipboard.readText().substring(0, 30)}"`);
  }, 50);

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
  new Notification({
    title: "StayFree",
    body: `Paste failed. Please focus a text field and try again.`,
    silent: true,
  }).show();
}
