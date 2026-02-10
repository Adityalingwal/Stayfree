import Groq from "groq-sdk";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import store from "./store";

/**
 * Groq Transcription Service
 * Uses Whisper large-v3-turbo for English transcription
 */

let groqClient: Groq | null = null;

function initializeGroq(): void {
  const apiKey = process.env.GROQ_API_KEY || store.get("groqApiKey");

  if (!apiKey) {
    console.error("[Groq] ERROR: GROQ_API_KEY not found in .env or settings");
    return;
  }

  groqClient = new Groq({
    apiKey: apiKey,
  });

  console.log("[Groq] Client initialized");
}

export async function transcribeWithGroq(
  audioBuffer: Buffer,
): Promise<string | null> {
  if (!groqClient) {
    initializeGroq();
  }

  if (!groqClient) {
    console.error("[Groq] Cannot transcribe - client not initialized");
    return null;
  }

  try {
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
