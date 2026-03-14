import { randomUUID } from "crypto";
import store, { ChatMessage, Note } from "./store";
import { getGroqClient } from "./groq-client";
import { generateEmbedding } from "./embeddings";
import { vectorStore } from "./vector-store";
import { getNotes, searchNotes } from "./notes";

const MAX_CHAT_HISTORY = 100;
const CONTEXT_HISTORY_COUNT = 6;
const NOTE_TRUNCATE_WORDS = 1000;
const CHAT_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are StayFree Brain, a personal knowledge assistant. You answer questions using ONLY the user's notes provided below.

Rules:
1. Answer using information from the provided notes ONLY.
2. Cite notes using [Note: title] format when referencing specific information.
3. Be concise and direct.
4. If the notes don't contain relevant information, say so honestly.
5. Never make up information that isn't in the notes.`;

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "...";
}

function formatNotesForPrompt(notes: Note[]): string {
  return notes
    .map((n, i) => {
      const content = n.cleanContent || n.content;
      return `--- Note ${i + 1}: "${n.title}" ---\n${truncateWords(content, NOTE_TRUNCATE_WORDS)}`;
    })
    .join("\n\n");
}

function extractCitedNoteIds(response: string, notes: Note[]): string[] {
  const cited: string[] = [];
  for (const note of notes) {
    if (response.includes(`[Note: ${note.title}]`)) {
      cited.push(note.id);
    }
  }
  return cited;
}

export async function retrieveRelevantNotes(query: string, topK = 5): Promise<Note[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const results = vectorStore.search(queryEmbedding, topK);
    const allNotes = getNotes({ includeArchived: false });
    const noteMap = new Map(allNotes.map((n) => [n.id, n]));
    return results
      .filter((r) => noteMap.has(r.id))
      .map((r) => noteMap.get(r.id)!);
  } catch (err) {
    console.warn("[Chat] Embedding search failed, falling back to keyword search:", err);
    return searchNotes(query).slice(0, topK);
  }
}

export function buildChatPrompt(
  question: string,
  relevantNotes: Note[],
  history: ChatMessage[],
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  messages.push({ role: "system", content: SYSTEM_PROMPT });

  // Include last N messages of history for conversational continuity
  const recentHistory = history.slice(-CONTEXT_HISTORY_COUNT);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Build the user message with notes context
  const notesContext = relevantNotes.length > 0
    ? `\n\nRelevant notes:\n${formatNotesForPrompt(relevantNotes)}\n\n`
    : "\n\n(No relevant notes found)\n\n";

  messages.push({
    role: "user",
    content: `${notesContext}Question: ${question}`,
  });

  return messages;
}

export async function handleChatQuery(question: string): Promise<ChatMessage> {
  const history = store.get("chatHistory") as ChatMessage[];

  // Save user message
  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: question,
    timestamp: Date.now(),
  };

  try {
    const relevantNotes = await retrieveRelevantNotes(question);
    const messages = buildChatPrompt(question, relevantNotes, history);

    const client = getGroqClient();
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "I couldn't generate a response.";
    const citedNoteIds = extractCitedNoteIds(content, relevantNotes);

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content,
      timestamp: Date.now(),
      citedNoteIds,
    };

    // Save both messages to history (capped)
    const updated = [...history, userMessage, assistantMessage].slice(-MAX_CHAT_HISTORY);
    store.set("chatHistory", updated);

    return assistantMessage;
  } catch (error) {
    console.error("[Chat] Query failed:", error);
    const errorMessage: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: "Sorry, I couldn't process your question right now. Please try again.",
      timestamp: Date.now(),
    };

    const updated = [...history, userMessage, errorMessage].slice(-MAX_CHAT_HISTORY);
    store.set("chatHistory", updated);

    return errorMessage;
  }
}
