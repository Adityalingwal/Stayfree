import store from "./store";
import * as fs from "fs";
import * as path from "path";
import FormData from "form-data";
import fetch from "node-fetch";

/**
 * Sarvam AI Transcription Service
 *
 * Uses Saaras v3 model with "codemix" mode for Hinglish support
 * - Handles Hindi, English, and code-mixed speech
 * - No LLM formatting (raw transcription for casual use)
 * - REST API for simplicity
 */

let sarvamApiKey: string | null = null;

function initializeSarvam(): void {
  const apiKey = process.env.SARVAM_API_KEY || store.get("sarvamApiKey");

  if (!apiKey) {
    console.error(
      "[Sarvam] ERROR: SARVAM_API_KEY not found in .env or settings",
    );
    return;
  }

  sarvamApiKey = apiKey;
  console.log("[Sarvam] API key initialized");
}

export async function transcribeWithSarvam(
  audioBuffer: Buffer,
): Promise<string | null> {
  if (!sarvamApiKey) {
    initializeSarvam();
  }

  if (!sarvamApiKey) {
    console.error("[Sarvam] Cannot transcribe - API key not initialized");
    return null;
  }

  try {
    const startTime = Date.now();
    console.log(
      `[Sarvam] Starting transcription (${audioBuffer.length} bytes)...`,
    );

    // Save audio buffer to temporary file (Sarvam API needs file upload)
    const tempDir = require("os").tmpdir();
    const tempAudioPath = path.join(
      tempDir,
      `stayfree-sarvam-${Date.now()}.webm`,
    );
    fs.writeFileSync(tempAudioPath, audioBuffer);

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempAudioPath));
    formData.append("model", "saaras:v3");
    formData.append("mode", "translit"); // Roman script output (mera phone number hai...)

    // Note: Other modes available:
    // - "transcribe": Original language with Devanagari (मेरा फोन नंबर है)
    // - "codemix": Mixed script (मेरा phone number है)
    // - "translate": English translation (My phone number is)

    // Call Sarvam API
    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": sarvamApiKey,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    // Clean up temp file
    fs.unlinkSync(tempAudioPath);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sarvam API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    // Extract transcript from response
    const transcript = result.transcript || "";

    console.log(`[Sarvam] ✓ Success in ${duration}ms: "${transcript}"`);

    // Optional: Log detected language
    if (result.language_code) {
      console.log(`[Sarvam] Detected language: ${result.language_code}`);
    }

    return transcript;
  } catch (error) {
    console.error("[Sarvam] ERROR:", error);
    return null;
  }
}
