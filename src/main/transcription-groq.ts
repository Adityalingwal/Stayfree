import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { getGroqClient } from "./groq-client";

/**
 * Groq Transcription Service
 * Uses Whisper large-v3-turbo for English transcription
 */

export async function transcribeWithGroq(
  audioBuffer: Buffer,
): Promise<string | null> {
  try {
    const groqClient = getGroqClient();
    const startTime = Date.now();
    console.log(
      `[Groq] Starting transcription (${audioBuffer.length} bytes)...`,
    );

    // Save audio buffer to a temporary file (Groq SDK needs a file)
    const tempDir = app.getPath("temp");
    const tempAudioPath = path.join(
      tempDir,
      `stayfree-groq-${Date.now()}.webm`,
    );
    fs.writeFileSync(tempAudioPath, audioBuffer);

    // Call Groq Whisper API
    const transcription = await groqClient.audio.transcriptions.create({
      file: fs.createReadStream(tempAudioPath),
      model: "whisper-large-v3-turbo",
      response_format: "text",
      language: "en",
    });

    // Clean up temp file
    fs.unlinkSync(tempAudioPath);

    const duration = Date.now() - startTime;
    const text =
      typeof transcription === "string" ? transcription : transcription.text;
    console.log(`[Groq] ✓ Success in ${duration}ms: "${text}"`);

    return text;
  } catch (error) {
    console.error("[Groq] ERROR:", error);
    return null;
  }
}
