import { describe, it, expect, vi, beforeEach } from "vitest";
import { cosineSimilarity, findSimilar } from "../embeddings";

// mockCreate must be defined before vi.mock (hoisted by Vitest)
const mockCreate = vi.fn();

// Mock the openai module — Fireworks uses OpenAI SDK with custom baseURL
// Must use a regular function (not arrow) so `new OpenAI()` works as a constructor
vi.mock("openai", () => {
  return {
    default: vi.fn(function () {
      return { embeddings: { create: mockCreate } };
    }),
  };
});

import { generateEmbedding, generateEmbeddings } from "../embeddings";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FIREWORKS_API_KEY = "fw_test_key";
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns 0 for zero vector", () => {
    const a = [1, 2, 3];
    const b = [0, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0 for both zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles non-normalized vectors correctly", () => {
    const a = [3, 4]; // magnitude 5
    const b = [6, 8]; // magnitude 10, same direction
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it("handles large vectors (768-dim simulation)", () => {
    const a = Array.from({ length: 768 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 768 }, (_, i) => Math.sin(i + 0.1));
    const score = cosineSimilarity(a, b);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1.0);
  });
});

describe("findSimilar", () => {
  const candidates = new Map<string, number[]>([
    ["a", [1, 0, 0]],
    ["b", [0, 1, 0]],
    ["c", [0.9, 0.1, 0]], // similar to a
    ["d", [0.1, 0.9, 0]], // similar to b
  ]);

  it("returns top-K results sorted by score", () => {
    const results = findSimilar([1, 0, 0], candidates, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[0].score).toBeCloseTo(1.0);
    expect(results[1].id).toBe("c");
    expect(results[1].score).toBeGreaterThan(0.9);
  });

  it("excludes the specified ID", () => {
    const results = findSimilar([1, 0, 0], candidates, 2, "a");
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === "a")).toBeUndefined();
    expect(results[0].id).toBe("c");
  });

  it("returns empty for empty candidates", () => {
    const results = findSimilar([1, 0, 0], new Map(), 5);
    expect(results).toHaveLength(0);
  });

  it("returns fewer than topK if not enough candidates", () => {
    const small = new Map<string, number[]>([["x", [1, 0, 0]]]);
    const results = findSimilar([1, 0, 0], small, 5);
    expect(results).toHaveLength(1);
  });

  it("handles topK of 0", () => {
    const results = findSimilar([1, 0, 0], candidates, 0);
    expect(results).toHaveLength(0);
  });
});

describe("generateEmbedding", () => {
  it("calls Fireworks API and returns embedding", async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    mockCreate.mockResolvedValueOnce({
      data: [{ embedding: fakeEmbedding }],
    });

    const result = await generateEmbedding("hello world");
    expect(result).toEqual(fakeEmbedding);
    expect(mockCreate).toHaveBeenCalledWith({
      input: "hello world",
      model: "nomic-ai/nomic-embed-text-v1.5",
    });
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API down"));
    await expect(generateEmbedding("test")).rejects.toThrow("API down");
  });
});

describe("generateEmbeddings", () => {
  it("returns empty array for empty input", async () => {
    const result = await generateEmbeddings([]);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("handles batch embedding", async () => {
    mockCreate.mockResolvedValueOnce({
      data: [
        { embedding: [1, 0] },
        { embedding: [0, 1] },
      ],
    });

    const result = await generateEmbeddings(["text1", "text2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([1, 0]);
    expect(result[1]).toEqual([0, 1]);
    expect(mockCreate).toHaveBeenCalledWith({
      input: ["text1", "text2"],
      model: "nomic-ai/nomic-embed-text-v1.5",
    });
  });
});
