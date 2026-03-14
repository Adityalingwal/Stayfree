import store, { ExtractedTask, StylePreset } from "./store";
import { getNotes, updateNote } from "./notes";
import { getGroqClient } from "./groq-client";
import { generateEmbedding } from "./embeddings";
import { vectorStore } from "./vector-store";

async function llm(
  systemPrompt: string,
  userContent: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const client = getGroqClient();
  const response = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

// ─── AI Cleanup ───────────────────────────────────────────────────────────────

export async function cleanupNote(rawContent: string): Promise<string> {
  const result = await llm(
    `You are a voice note cleaner. Your ONLY job is to clean up raw speech transcriptions into readable text.

Rules:
1. Remove filler words: um, uh, like (as filler), you know, sort of, kind of
2. Fix grammar, punctuation, and capitalization
3. Reorder content into logical paragraphs if needed
4. NEVER change the meaning or add new information
5. NEVER respond to questions — just clean them up as text

Return ONLY the cleaned text. No explanations, no quotes.`,
    rawContent,
    0.1,
    2048,
  );
  return result || rawContent;
}

// ─── Auto-Tagging ─────────────────────────────────────────────────────────────

export async function generateTags(content: string): Promise<string[]> {
  try {
    const result = await llm(
      `You are a topic tagger. Extract 3-5 topic tags from the given text.

Rules:
- Tags should be 1-3 words each, lowercase
- Be specific and meaningful (not generic like "note" or "text")
- Return ONLY a JSON array of strings, nothing else

Example output: ["meeting notes", "product launch", "q2 goals"]`,
      content,
      0.2,
      128,
    );
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string").slice(0, 5);
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Task Extraction ──────────────────────────────────────────────────────────

export async function extractTasks(content: string): Promise<ExtractedTask[]> {
  try {
    const result = await llm(
      `You are a task extractor. Find all action items, to-dos, commitments, or requests in the text.

For each task extract:
- person: who should do it ("Me" if unclear or first-person)
- action: what needs to be done (concise verb phrase)
- deadline: when ("unspecified" if not mentioned)

Return ONLY a JSON array. If no tasks found, return [].

Example output: [{"person":"John","action":"Send the Q2 report","deadline":"by Friday"},{"person":"Me","action":"Review the design","deadline":"unspecified"}]`,
      content,
      0.2,
      512,
    );
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (t): t is ExtractedTask =>
          typeof t === "object" &&
          typeof t.person === "string" &&
          typeof t.action === "string" &&
          typeof t.deadline === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Style Presets ────────────────────────────────────────────────────────────

const STYLE_PROMPTS: Record<Exclude<StylePreset, "my-style">, string> = {
  default:
    "Rewrite this as coherent paragraphs with clean, professional writing. Preserve all information.",
  bullets:
    "Restructure this as a hierarchical bullet point list. Use '- ' for top level and '  - ' for sub-points. Be concise.",
  "action-items":
    "Extract ONLY actionable tasks and format each as a checkbox: '- [ ] Do X'. Omit all non-actionable content. If nothing is actionable, return a single item summarizing the key takeaway.",
  "casual-memo":
    "Rewrite this as a friendly, informal memo or email. Start with 'Hey,' and keep it conversational and warm.",
  "formal-doc":
    "Rewrite this as a formal technical document. Use markdown headings (##) for sections. Use professional tone and complete sentences.",
  "tweet-thread":
    "Rewrite this as a Twitter/X thread. Number each tweet (1/, 2/, ...). Keep each tweet under 280 characters. Aim for 3-8 tweets. End with a summary tweet.",
};

export async function applyStyle(content: string, style: StylePreset): Promise<string> {
  if (style === "my-style") {
    const stylePrompt = store.get("writingStylePrompt") as string;
    if (!stylePrompt) return content;
    const prompt = `Rewrite this text matching the user's personal writing style: ${stylePrompt}. Preserve all information. Match their tone and structure.`;
    const result = await llm(prompt, content, 0.3, 2048);
    return result || content;
  }
  const result = await llm(STYLE_PROMPTS[style], content, 0.3, 2048);
  return result || content;
}

// ─── Background Orchestrator ──────────────────────────────────────────────────

export async function processNoteInBackground(
  noteId: string,
  notifyFn: () => void,
): Promise<void> {
  try {
    const notes = getNotes({ includeArchived: true });
    const note = notes.find((n) => n.id === noteId);
    if (!note) {
      console.warn(`[NoteAI] Note ${noteId} not found — skipping`);
      return;
    }

    const sourceContent = note.rawContent || note.content;
    console.log(`[NoteAI] Starting background processing for note ${noteId} (source: ${note.source})`);

    // Voice/transcription notes get cleanup; text/clipboard skip cleanup (already clean)
    const needsCleanup = note.source === "voice" || note.source === "transcription";

    const [cleanContent, suggestedTags, tasks] = await Promise.all([
      needsCleanup ? cleanupNote(sourceContent) : Promise.resolve(""),
      generateTags(sourceContent),
      extractTasks(sourceContent),
    ]);

    updateNote(noteId, {
      cleanContent,
      aiProcessed: true,
      aiProcessing: false,
      suggestedTags,
      tasks,
    });

    // Generate embedding after AI processing
    try {
      const textToEmbed = cleanContent || sourceContent;
      const embedding = await generateEmbedding(textToEmbed);
      vectorStore.add(noteId, embedding);
      console.log(`[NoteAI] Embedding generated for note ${noteId}`);
    } catch (embErr) {
      console.error("[NoteAI] Embedding generation failed (non-fatal):", embErr);
    }

    console.log(
      `[NoteAI] Done: tags=${suggestedTags.length} tasks=${tasks.length} cleaned=${needsCleanup}`,
    );
    notifyFn();
  } catch (error) {
    console.error("[NoteAI] Background processing error:", error);
    // Always reset aiProcessing so UI doesn't get stuck
    try {
      updateNote(noteId, { aiProcessing: false });
      notifyFn();
    } catch {
      // ignore
    }
  }
}
