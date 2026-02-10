import store from "./store";
import { transcribeWithGroq } from "./transcription-groq";
import { transcribeWithSarvam } from "./transcription-sarvam";

/**
 * Transcription Router
 *
 * Routes audio to the appropriate transcription service based on language preference:
 * - English → Groq Whisper (fast, accurate for English)
 * - Hindi/Hinglish → Sarvam Saaras v3 (optimized for Indian languages)
 */

export async function transcribe(audioBuffer: Buffer): Promise<string | null> {
  // Get language preference from settings
  const langPref = (store.get("languagePreference") as string) || "english";

  console.log(`[Transcription] Language preference: ${langPref}`);

  // Route to correct provider
  if (langPref === "english") {
    console.log("[Transcription] Using Groq Whisper for English");
    return transcribeWithGroq(audioBuffer);
  } else if (langPref === "hindi") {
    console.log("[Transcription] Using Sarvam AI for Hindi/Hinglish");
    return transcribeWithSarvam(audioBuffer);
  }

  console.error(`[Transcription] Unknown language preference: ${langPref}`);
  return null;
}
