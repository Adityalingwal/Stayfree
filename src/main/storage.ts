import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

/**
 * Storage Helper
 *
 * Manages audio recording files on disk.
 * All files live under: ~/Library/Application Support/StayFree/recordings/
 */

const RECORDINGS_FOLDER = "recordings";

/**
 * Returns the absolute path to the recordings directory.
 * Creates the directory if it doesn't exist.
 */
export function getRecordingsDir(): string {
  const dir = path.join(app.getPath("userData"), RECORDINGS_FOLDER);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Saves audio data to the recordings directory.
 * Returns the filename (NOT full path) on success, or null on failure.
 *
 * Uses async write to avoid blocking the main process.
 */
export async function saveAudioFile(
  audioData: Buffer,
  timestamp: string,
): Promise<string | null> {
  try {
    const filename = `recording-${timestamp}.webm`;
    const fullPath = path.join(getRecordingsDir(), filename);
    await fs.promises.writeFile(fullPath, audioData);
    console.log(`[Storage] Audio saved: ${fullPath}`);
    return filename;
  } catch (error) {
    console.error("[Storage] Failed to save audio file:", error);
    return null;
  }
}

/**
 * Deletes a single audio file by filename.
 * Silently ignores "file not found" (ENOENT) errors.
 */
export function deleteAudioFile(filename: string): void {
  try {
    const fullPath = path.join(getRecordingsDir(), filename);
    fs.unlinkSync(fullPath);
    console.log(`[Storage] Deleted: ${filename}`);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      // File already gone — not a problem
      return;
    }
    console.error(`[Storage] Failed to delete ${filename}:`, error);
  }
}

/**
 * Deletes ALL audio files in the recordings directory.
 * Used by "Clear History". Continues past individual file failures.
 */
export function cleanupAllAudioFiles(): void {
  try {
    const dir = getRecordingsDir();
    const files = fs.readdirSync(dir);
    let deleted = 0;
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(dir, file));
        deleted++;
      } catch (error) {
        console.error(`[Storage] Failed to delete ${file}:`, error);
      }
    }
    console.log(
      `[Storage] Cleanup complete: ${deleted}/${files.length} files deleted`,
    );
  } catch (error) {
    console.error("[Storage] Cleanup failed:", error);
  }
}
