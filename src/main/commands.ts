import { StylePreset } from "./store";
import { getGroqClient } from "./groq-client";

export type CommandType =
  | "save-note"
  | "save-clipboard"
  | "open-notes"
  | "restyle-note"
  | "find-notes"
  | "summarize-notes"
  | "show-tasks"
  | "ask-question"
  | "time-query"
  | "unknown";

export interface CommandResult {
  type: CommandType;
  content?: string;
  style?: StylePreset;
  query?: string;
  timeRange?: { start: number; end: number };
}

const VALID_TYPES = new Set<CommandType>([
  "save-note",
  "save-clipboard",
  "open-notes",
  "restyle-note",
  "find-notes",
  "summarize-notes",
  "show-tasks",
  "ask-question",
  "time-query",
  "unknown",
]);

const VALID_STYLES = new Set<string>([
  "default",
  "bullets",
  "action-items",
  "casual-memo",
  "formal-doc",
  "tweet-thread",
  "my-style",
]);

const CLASSIFY_PROMPT = `You are a voice command classifier for a note-taking app. Given a user's spoken command, classify it and extract parameters.

Available command types:
- save-note: User wants to save something as a note. Extract the content to save.
- save-clipboard: User wants to save clipboard contents to notes.
- open-notes: User wants to open/show the notes page.
- restyle-note: User wants to change the style of a note. Extract the style (one of: default, bullets, action-items, casual-memo, formal-doc, tweet-thread).
- find-notes: User wants to search/find notes about a topic. Extract the topic.
- summarize-notes: User wants a summary of notes about a topic. Extract the topic.
- show-tasks: User wants to see their action items/tasks across notes.
- ask-question: User is asking a question about their notes (general knowledge recall).
- time-query: User wants to see what they captured in a time period. Extract the period (today, yesterday, this week, last week).
- unknown: Cannot determine intent.

Return ONLY valid JSON (no markdown, no explanation):
{"type": "<command-type>", "content": "<note content if save-note>", "topic": "<topic if find/summarize>", "style": "<style if restyle>", "timePeriod": "<period if time-query>"}`;

/**
 * Resolve a human time period string to epoch range.
 * Supports: today, yesterday, this week, last week.
 */
export function resolveTimeRange(period: string): { start: number; end: number } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const p = period.toLowerCase().trim();
  if (p.includes("yesterday")) {
    const start = new Date(startOfDay);
    start.setDate(start.getDate() - 1);
    return { start: start.getTime(), end: startOfDay.getTime() };
  }
  if (p.includes("last week")) {
    const dayOfWeek = startOfDay.getDay();
    const lastMonday = new Date(startOfDay);
    lastMonday.setDate(lastMonday.getDate() - dayOfWeek - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 7);
    return { start: lastMonday.getTime(), end: lastSunday.getTime() };
  }
  if (p.includes("this week")) {
    const dayOfWeek = startOfDay.getDay();
    const monday = new Date(startOfDay);
    monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7));
    return { start: monday.getTime(), end: now.getTime() };
  }
  // Default: today
  return { start: startOfDay.getTime(), end: now.getTime() };
}

export async function parseCommand(transcript: string): Promise<CommandResult> {
  const t = transcript.trim();
  if (!t) return { type: "unknown" };

  try {
    const client = getGroqClient();
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: t },
      ],
      temperature: 0.1,
      max_tokens: 256,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw);

    const type = VALID_TYPES.has(parsed.type) ? parsed.type as CommandType : "unknown";

    const result: CommandResult = { type };

    if (type === "save-note") {
      result.content = typeof parsed.content === "string" ? parsed.content : t;
    }
    if (type === "restyle-note") {
      result.style = VALID_STYLES.has(parsed.style) ? parsed.style as StylePreset : "default";
    }
    if (type === "find-notes" || type === "summarize-notes" || type === "ask-question") {
      result.query = typeof parsed.topic === "string" ? parsed.topic : t;
    }
    if (type === "time-query") {
      const period = typeof parsed.timePeriod === "string" ? parsed.timePeriod : "today";
      result.timeRange = resolveTimeRange(period);
    }

    return result;
  } catch (error) {
    console.error("[Commands] LLM classification failed:", error);
    return { type: "unknown" };
  }
}
