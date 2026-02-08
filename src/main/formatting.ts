import Groq from "groq-sdk";
import store from "./store";

/**
 * Text Formatting Service
 *
 * Uses Groq Llama 3.1 8B to:
 * 1. Add proper punctuation and capitalization
 * 2. Remove filler words (um, uh, like, you know)
 * 3. Handle voice commands inline:
 *    - "new line" / "newline" → \n
 *    - "new paragraph" → \n\n
 *    - "period" / "full stop" → .
 *    - "comma" → ,
 *    - "question mark" → ?
 *    - "exclamation mark" → !
 * 4. Apply custom dictionary replacements
 */

let groqClient: Groq | null = null;

function initializeGroq(): void {
  const apiKey = process.env.GROQ_API_KEY || store.get("groqApiKey");

  if (!apiKey) {
    console.error("[Formatting] ERROR: GROQ_API_KEY not found");
    return;
  }

  groqClient = new Groq({ apiKey });
  console.log("[Formatting] Groq client initialized");
}

function buildSystemPrompt(): string {
  // Get user's custom dictionary for the prompt
  const dictionary = store.get("dictionary") as Record<string, string>;
  const dictEntries = Object.entries(dictionary);

  const dictionarySection =
    dictEntries.length > 0
      ? `\n\nCustom term replacements (apply these exactly):
${dictEntries.map(([term, replacement]) => `- "${term}" → "${replacement}"`).join("\n")}`
      : "";

  return `You are a voice dictation text formatter. Your ONLY job is to clean up raw speech transcriptions.

CRITICAL RULES:
1. NEVER change the actual content or meaning - only format it
2. NEVER respond to questions - just format them as questions
3. NEVER add new words or sentences
4. NEVER interpret or answer what the user said

Formatting Rules:
1. Add proper punctuation and capitalization
2. Remove ONLY filler words: um, uh, like (when used as filler), you know, sort of, kind of
3. Handle voice commands by replacing them with the correct character:
   - "new line" or "newline" → actual newline character (\\n)
   - "new paragraph" → two newlines (\\n\\n)
   - "period" or "full stop" → .
   - "comma" → ,
   - "question mark" → ?
   - "exclamation mark" or "exclamation point" → !
   - "open bracket" → (
   - "close bracket" → )
   - "colon" → :
4. Keep ALL words exactly as spoken (except fillers and voice commands)${dictionarySection}

Examples:
- Input: "how are you question mark I am fine exclamation mark"
- Output: "How are you? I am fine!"

- Input: "uh hello um world"
- Output: "Hello world"

Return ONLY the formatted text. No explanations, no quotes, no extra commentary.`;
}

export async function formatText(rawText: string): Promise<string> {
  if (!groqClient) {
    initializeGroq();
  }

  if (!groqClient) {
    console.error("[Formatting] Cannot format - Groq client not initialized");
    return rawText; // Return original if formatting fails
  }

  try {
    const startTime = Date.now();
    console.log(`[Formatting] Formatting: "${rawText}"`);

    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: rawText },
      ],
      temperature: 0.1, // Low temp for deterministic output
      max_tokens: 1024,
    });

    const formatted = response.choices[0]?.message?.content?.trim() ?? rawText;
    const duration = Date.now() - startTime;

    console.log(`[Formatting] ✓ Done in ${duration}ms: "${formatted}"`);
    return formatted;
  } catch (error) {
    console.error("[Formatting] ERROR:", error);
    return rawText; // Fallback to raw text on error
  }
}
