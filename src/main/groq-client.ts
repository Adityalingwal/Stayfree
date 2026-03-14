import Groq from "groq-sdk";
import store from "./store";

/**
 * Shared Groq SDK singleton.
 * All modules (formatting, transcription, note-ai, embeddings, chat)
 * import from here instead of maintaining their own client instances.
 */

let groqClient: Groq | null = null;

export function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY || store.get("groqApiKey");
    if (!apiKey) {
      throw new Error(
        "Groq API key not configured. Set GROQ_API_KEY env var or add it in Settings.",
      );
    }
    groqClient = new Groq({ apiKey });
    console.log("[GroqClient] Initialized");
  }
  return groqClient;
}

/** Call when the user changes their API key in settings. */
export function resetGroqClient(): void {
  groqClient = null;
  console.log("[GroqClient] Reset — will re-init on next use");
}
