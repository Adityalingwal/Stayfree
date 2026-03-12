import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/test-stayfree") },
}));

// Mock groq-client
vi.mock("../groq-client", () => ({
  getGroqClient: vi.fn(),
}));

// Mock embeddings
vi.mock("../embeddings", () => ({
  generateEmbedding: vi.fn(),
}));

// Mock vector-store
vi.mock("../vector-store", () => ({
  vectorStore: {
    search: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock store
vi.mock("../store", () => {
  const chatHistory: unknown[] = [];
  return {
    default: {
      get: vi.fn((key: string) => {
        if (key === "chatHistory") return [...chatHistory];
        if (key === "notes") return [];
        return "";
      }),
      set: vi.fn((key: string, value: unknown) => {
        if (key === "chatHistory") {
          chatHistory.length = 0;
          (value as unknown[]).forEach((v) => chatHistory.push(v));
        }
      }),
    },
  };
});

// Mock notes
vi.mock("../notes", () => ({
  getNotes: vi.fn(() => []),
  searchNotes: vi.fn(() => []),
}));

import { buildChatPrompt, retrieveRelevantNotes, handleChatQuery } from "../chat";
import { getGroqClient } from "../groq-client";
import { generateEmbedding } from "../embeddings";
import { vectorStore } from "../vector-store";
import { getNotes, searchNotes } from "../notes";
import store from "../store";
import type { Note, ChatMessage } from "../store";

const mockCreate = vi.fn();
const mockClient = {
  chat: { completions: { create: mockCreate } },
};

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Some test content",
    rawContent: "Some test content",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "text",
    pinned: false,
    archived: false,
    tags: [],
    cleanContent: "",
    aiProcessed: false,
    aiProcessing: false,
    stylePreset: "default",
    styledContent: "",
    suggestedTags: [],
    tasks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getGroqClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);
  // Reset chat history
  (store.set as ReturnType<typeof vi.fn>).mockClear();
  (store.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
    if (key === "chatHistory") return [];
    if (key === "notes") return [];
    return "";
  });
});

describe("buildChatPrompt", () => {
  it("includes system prompt as first message", () => {
    const messages = buildChatPrompt("hello", [], []);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("StayFree Brain");
  });

  it("includes notes context in user message", () => {
    const notes = [makeNote({ title: "My Note", content: "Important info" })];
    const messages = buildChatPrompt("what's important?", notes, []);
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("My Note");
    expect(userMsg?.content).toContain("Important info");
  });

  it("shows no notes message when empty", () => {
    const messages = buildChatPrompt("hello", [], []);
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("No relevant notes found");
  });

  it("includes recent history for continuity", () => {
    const history: ChatMessage[] = [
      { id: "1", role: "user", content: "first question", timestamp: 1 },
      { id: "2", role: "assistant", content: "first answer", timestamp: 2 },
    ];
    const messages = buildChatPrompt("second question", [], history);
    expect(messages.some((m) => m.content === "first question")).toBe(true);
    expect(messages.some((m) => m.content === "first answer")).toBe(true);
  });

  it("caps history to last 6 messages", () => {
    const history: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? "user" as const : "assistant" as const,
      content: `msg-${i}`,
      timestamp: i,
    }));
    const messages = buildChatPrompt("new question", [], history);
    // Should not include msg-0 through msg-3
    expect(messages.some((m) => m.content === "msg-0")).toBe(false);
    expect(messages.some((m) => m.content === "msg-3")).toBe(false);
    // Should include msg-4 through msg-9
    expect(messages.some((m) => m.content === "msg-4")).toBe(true);
    expect(messages.some((m) => m.content === "msg-9")).toBe(true);
  });

  it("truncates long note content", () => {
    const longContent = Array(1500).fill("word").join(" ");
    const notes = [makeNote({ content: longContent })];
    const messages = buildChatPrompt("question", notes, []);
    const userMsg = messages.find((m) => m.role === "user");
    // Should end with "..." indicating truncation
    expect(userMsg?.content).toContain("...");
  });
});

describe("retrieveRelevantNotes", () => {
  it("uses vector search when embedding succeeds", async () => {
    const note = makeNote({ id: "n1" });
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([{ id: "n1", score: 0.9 }]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([note]);

    const results = await retrieveRelevantNotes("test query");
    expect(generateEmbedding).toHaveBeenCalledWith("test query");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("n1");
  });

  it("falls back to keyword search on embedding failure", async () => {
    const note = makeNote({ id: "n2" });
    (generateEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API down"));
    (searchNotes as ReturnType<typeof vi.fn>).mockReturnValue([note]);

    const results = await retrieveRelevantNotes("test query");
    expect(searchNotes).toHaveBeenCalledWith("test query");
    expect(results).toHaveLength(1);
  });

  it("filters out archived notes", async () => {
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([{ id: "n1", score: 0.9 }]);
    // getNotes with includeArchived: false already filters, so no n1 returned
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const results = await retrieveRelevantNotes("test query");
    expect(results).toHaveLength(0);
  });
});

describe("handleChatQuery", () => {
  it("returns assistant message with content", async () => {
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Here is your answer." } }],
    });

    const result = await handleChatQuery("what is happening?");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Here is your answer.");
    expect(result.id).toBeTruthy();
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("uses the correct model (70B)", async () => {
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "response" } }],
    });

    await handleChatQuery("test");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "llama-3.3-70b-versatile" }),
    );
  });

  it("extracts cited note IDs", async () => {
    const note = makeNote({ id: "cited-1", title: "Physics Notes" });
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([{ id: "cited-1", score: 0.9 }]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([note]);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "According to [Note: Physics Notes], gravity is 9.8." } }],
    });

    const result = await handleChatQuery("tell me about physics");
    expect(result.citedNoteIds).toContain("cited-1");
  });

  it("saves both user and assistant messages to history", async () => {
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "answer" } }],
    });

    await handleChatQuery("question");
    expect(store.set).toHaveBeenCalledWith(
      "chatHistory",
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "question" }),
        expect.objectContaining({ role: "assistant", content: "answer" }),
      ]),
    );
  });

  it("returns error message on Groq failure (never throws)", async () => {
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockCreate.mockRejectedValueOnce(new Error("API error"));

    const result = await handleChatQuery("test");
    expect(result.role).toBe("assistant");
    expect(result.content).toContain("Sorry");
  });

  it("caps history at 100 messages", async () => {
    const existingHistory = Array.from({ length: 99 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? "user" as const : "assistant" as const,
      content: `msg-${i}`,
      timestamp: i,
    }));
    (store.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === "chatHistory") return existingHistory;
      return [];
    });
    (generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([1, 0, 0]);
    (vectorStore.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (getNotes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "answer" } }],
    });

    await handleChatQuery("new question");
    const savedHistory = (store.set as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "chatHistory",
    );
    expect(savedHistory).toBeTruthy();
    // 99 existing + 2 new = 101, capped to 100
    expect(savedHistory![1]).toHaveLength(100);
  });
});
