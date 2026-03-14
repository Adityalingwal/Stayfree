import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron's app module
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-stayfree"),
  },
}));

// Mock fs for persistence tests
vi.mock("fs", () => {
  const actual = vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Must import after mocks are set up
import { vectorStore } from "../vector-store";
import * as fs from "fs";

beforeEach(async () => {
  // Reset the store state between tests by removing all entries
  vectorStore.getAllIds().forEach((id) => vectorStore.remove(id));

  // Load with empty state
  (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
  await vectorStore.load();

  vi.clearAllMocks();
});

describe("VectorStore", () => {
  describe("add and has", () => {
    it("stores an embedding and reports it exists", () => {
      vectorStore.add("note1", [1, 0, 0]);
      expect(vectorStore.has("note1")).toBe(true);
    });

    it("returns false for non-existent note", () => {
      expect(vectorStore.has("nonexistent")).toBe(false);
    });

    it("overwrites existing embedding", () => {
      vectorStore.add("note1", [1, 0, 0]);
      vectorStore.add("note1", [0, 1, 0]);
      const result = vectorStore.get("note1");
      expect(result).toEqual([0, 1, 0]);
    });
  });

  describe("remove", () => {
    it("removes an embedding", () => {
      vectorStore.add("note1", [1, 0, 0]);
      vectorStore.remove("note1");
      expect(vectorStore.has("note1")).toBe(false);
    });

    it("does not throw when removing non-existent note", () => {
      expect(() => vectorStore.remove("nonexistent")).not.toThrow();
    });

    it("also clears stale status", () => {
      vectorStore.add("note1", [1, 0, 0]);
      vectorStore.markStale("note1");
      vectorStore.remove("note1");
      expect(vectorStore.getStaleIds()).not.toContain("note1");
    });
  });

  describe("search", () => {
    it("returns similar notes ranked by score", () => {
      vectorStore.add("a", [1, 0, 0]);
      vectorStore.add("b", [0, 1, 0]);
      vectorStore.add("c", [0.9, 0.1, 0]);

      const results = vectorStore.search([1, 0, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("a");
      expect(results[1].id).toBe("c");
    });

    it("excludes the specified ID", () => {
      vectorStore.add("a", [1, 0, 0]);
      vectorStore.add("b", [0.9, 0.1, 0]);

      const results = vectorStore.search([1, 0, 0], 5, "a");
      expect(results.find((r) => r.id === "a")).toBeUndefined();
    });

    it("returns empty for empty store", () => {
      const results = vectorStore.search([1, 0, 0], 5);
      expect(results).toHaveLength(0);
    });
  });

  describe("staleness tracking", () => {
    it("marks a note as stale", () => {
      vectorStore.add("note1", [1, 0, 0]);
      vectorStore.markStale("note1");
      expect(vectorStore.getStaleIds()).toContain("note1");
    });

    it("add clears stale status", () => {
      vectorStore.add("note1", [1, 0, 0]);
      vectorStore.markStale("note1");
      vectorStore.add("note1", [0, 1, 0]); // re-embed clears stale
      expect(vectorStore.getStaleIds()).not.toContain("note1");
    });

    it("returns empty stale list when nothing is stale", () => {
      vectorStore.add("note1", [1, 0, 0]);
      expect(vectorStore.getStaleIds()).toHaveLength(0);
    });
  });

  describe("size", () => {
    it("tracks number of embeddings", () => {
      expect(vectorStore.size).toBe(0);
      vectorStore.add("a", [1]);
      vectorStore.add("b", [2]);
      expect(vectorStore.size).toBe(2);
      vectorStore.remove("a");
      expect(vectorStore.size).toBe(1);
    });
  });

  describe("persistence", () => {
    it("flushes to JSON file", async () => {
      vectorStore.add("note1", [1, 2, 3]);
      await vectorStore.flush();

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("note-embeddings.json"),
        expect.any(String),
        "utf-8",
      );

      const writtenData = JSON.parse(
        (fs.promises.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1],
      );
      expect(writtenData.note1).toEqual([1, 2, 3]);
    });

    it("loads from existing JSON file", async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.promises.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({ existing: [4, 5, 6] }),
      );

      await vectorStore.load();
      expect(vectorStore.has("existing")).toBe(true);
      expect(vectorStore.get("existing")).toEqual([4, 5, 6]);
    });

    it("handles corrupted file gracefully", async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.promises.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        "not valid json",
      );

      // Should not throw
      await expect(vectorStore.load()).resolves.not.toThrow();
    });
  });
});
