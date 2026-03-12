import { execFile, ChildProcess } from "child_process";

/**
 * macOS text-to-speech wrapper using the `say` command.
 */

let activeProcess: ChildProcess | null = null;

export function speak(text: string, voice = "Samantha"): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking();
    activeProcess = execFile("say", ["-v", voice, "-r", "200", text], (err) => {
      activeProcess = null;
      if (err && (err as Error & { killed?: boolean }).killed) {
        // Process was killed by stopSpeaking — not an error
      } else if (err) {
        console.error("[TTS] speak error:", err);
      }
      resolve();
    });
  });
}

export function stopSpeaking(): void {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
}

export function isSpeaking(): boolean {
  return activeProcess !== null;
}
