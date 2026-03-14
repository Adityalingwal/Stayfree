import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTimeRange } from "../commands";

// Mock groq-client before importing parseCommand
vi.mock("../groq-client", () => ({
  getGroqClient: vi.fn(),
}));

import { parseCommand } from "../commands";
import { getGroqClient } from "../groq-client";

const mockCreate = vi.fn();
const mockClient = {
  chat: { completions: { create: mockCreate } },
};

beforeEach(() => {
  vi.clearAllMocks();
  (getGroqClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);
});

function mockLLMResponse(json: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(json) } }],
  });
}

describe("parseCommand", () => {
  it("returns unknown for empty transcript", async () => {
    const result = await parseCommand("");
    expect(result.type).toBe("unknown");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns unknown for whitespace-only transcript", async () => {
    const result = await parseCommand("   ");
    expect(result.type).toBe("unknown");
  });

  it("classifies save-note with content", async () => {
    mockLLMResponse({ type: "save-note", content: "Buy groceries tomorrow" });
    const result = await parseCommand("save to notes buy groceries tomorrow");
    expect(result.type).toBe("save-note");
    expect(result.content).toBe("Buy groceries tomorrow");
  });

  it("classifies save-clipboard", async () => {
    mockLLMResponse({ type: "save-clipboard" });
    const result = await parseCommand("save clipboard to notes");
    expect(result.type).toBe("save-clipboard");
  });

  it("classifies open-notes", async () => {
    mockLLMResponse({ type: "open-notes" });
    const result = await parseCommand("open notes");
    expect(result.type).toBe("open-notes");
  });

  it("classifies restyle-note with valid style", async () => {
    mockLLMResponse({ type: "restyle-note", style: "bullets" });
    const result = await parseCommand("turn last note into bullet points");
    expect(result.type).toBe("restyle-note");
    expect(result.style).toBe("bullets");
  });

  it("defaults restyle style to 'default' for invalid style", async () => {
    mockLLMResponse({ type: "restyle-note", style: "invalid-style" });
    const result = await parseCommand("restyle my note");
    expect(result.type).toBe("restyle-note");
    expect(result.style).toBe("default");
  });

  it("classifies find-notes with topic", async () => {
    mockLLMResponse({ type: "find-notes", topic: "physics" });
    const result = await parseCommand("find notes about physics");
    expect(result.type).toBe("find-notes");
    expect(result.query).toBe("physics");
  });

  it("classifies summarize-notes with topic", async () => {
    mockLLMResponse({ type: "summarize-notes", topic: "YC application" });
    const result = await parseCommand("summarize my notes about YC application");
    expect(result.type).toBe("summarize-notes");
    expect(result.query).toBe("YC application");
  });

  it("classifies show-tasks", async () => {
    mockLLMResponse({ type: "show-tasks" });
    const result = await parseCommand("show my action items");
    expect(result.type).toBe("show-tasks");
  });

  it("classifies ask-question with query", async () => {
    mockLLMResponse({ type: "ask-question", topic: "command hotkeys" });
    const result = await parseCommand("what did I decide about command hotkeys");
    expect(result.type).toBe("ask-question");
    expect(result.query).toBe("command hotkeys");
  });

  it("classifies time-query with time range", async () => {
    mockLLMResponse({ type: "time-query", timePeriod: "yesterday" });
    const result = await parseCommand("what did I capture yesterday");
    expect(result.type).toBe("time-query");
    expect(result.timeRange).toBeDefined();
    expect(result.timeRange!.start).toBeLessThan(result.timeRange!.end);
  });

  it("falls back to unknown on malformed LLM JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json" } }],
    });
    const result = await parseCommand("some random command");
    expect(result.type).toBe("unknown");
  });

  it("falls back to unknown on LLM error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error"));
    const result = await parseCommand("some command");
    expect(result.type).toBe("unknown");
  });

  it("falls back to unknown for unrecognized type from LLM", async () => {
    mockLLMResponse({ type: "nonexistent-command" });
    const result = await parseCommand("do something weird");
    expect(result.type).toBe("unknown");
  });

  it("uses transcript as content fallback for save-note without content", async () => {
    mockLLMResponse({ type: "save-note", content: 123 }); // non-string content
    const result = await parseCommand("save my idea about the project");
    expect(result.type).toBe("save-note");
    expect(result.content).toBe("save my idea about the project");
  });

  it("uses transcript as query fallback for find-notes without topic", async () => {
    mockLLMResponse({ type: "find-notes" }); // no topic
    const result = await parseCommand("find stuff about physics");
    expect(result.type).toBe("find-notes");
    expect(result.query).toBe("find stuff about physics");
  });
});

describe("resolveTimeRange", () => {
  it("returns today's range for 'today'", () => {
    const range = resolveTimeRange("today");
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(range.start).toBe(startOfDay.getTime());
    expect(range.end).toBeGreaterThanOrEqual(range.start);
  });

  it("returns yesterday's range", () => {
    const range = resolveTimeRange("yesterday");
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(range.end).toBe(startOfToday.getTime());
    expect(range.start).toBe(startOfToday.getTime() - 86400000);
  });

  it("returns this week's range", () => {
    const range = resolveTimeRange("this week");
    expect(range.start).toBeLessThan(range.end);
    // Start should be a Monday
    const startDate = new Date(range.start);
    expect(startDate.getDay()).toBe(1); // Monday
  });

  it("returns last week's range", () => {
    const range = resolveTimeRange("last week");
    expect(range.end - range.start).toBe(7 * 86400000);
    const startDate = new Date(range.start);
    expect(startDate.getDay()).toBe(1); // Monday
  });

  it("defaults to today for unknown period", () => {
    const range = resolveTimeRange("some random text");
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(range.start).toBe(startOfDay.getTime());
  });
});
