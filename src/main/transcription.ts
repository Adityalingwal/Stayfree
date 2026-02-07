import Groq from "groq-sdk";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import store from "./store";

/**
 * Transcription Service
 * Uses Groq API with Whisper large-v3-turbo model
 */

let groqClient: Groq | null = null;

function initializeGroq(): void {
  // Get API key from environment variable or store
  const apiKey = process.env.GROQ_API_KEY || store.get("groqApiKey");

  if (!apiKey) {
    console.error(
      "[Transcription] ERROR: GROQ_API_KEY not found in .env or settings",
    );
    return;
  }

  groqClient = new Groq({
    apiKey: apiKey,
  });

  console.log("[Transcription] Groq client initialized");
}

export async function transcribe(
  audioBuffer: Buffer,
): Promise<string | null> {
  if (!groqClient) {
    initializeGroq();
  }

  if (!groqClient) {
    console.error(
      "[Transcription] Cannot transcribe - Groq client not initialized",
    );
    return null;
  }

  try {
    const startTime = Date.now();
    console.log(
      `[Transcription] Starting transcription (${audioBuffer.length} bytes)...`,
    );

    // Save audio buffer to a temporary file (Groq SDK needs a file)
    const tempDir = app.getPath("temp");
    const tempAudioPath = path.join(tempDir, `stayfree-${Date.now()}.webm`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    // Call Groq Whisper API
    const transcription = await groqClient.audio.transcriptions.create({
      file: fs.createReadStream(tempAudioPath),
      model: "whisper-large-v3-turbo",
      response_format: "text",
      language: "en", // TODO: Phase 9 - support multiple languages
    });

    // Clean up temp file
    fs.unlinkSync(tempAudioPath);

    const duration = Date.now() - startTime;
    const text =
      typeof transcription === "string" ? transcription : transcription.text;
    console.log(`[Transcription] ✓ Success in ${duration}ms: "${text}"`);

    return text;
  } catch (error) {
    console.error("[Transcription] ERROR:", error);
    return null;
  }
}
