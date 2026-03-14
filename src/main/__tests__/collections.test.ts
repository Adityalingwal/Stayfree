import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/test-stayfree") },
}));

// Mock groq-client
vi.mock("../groq-client", () => ({
  getGroqClient: vi.fn(),
}));

// Mock store
let storeData: Record<string, unknown> = { collections: [] };
vi.mock("../store", () => ({
  default: {
    get: vi.fn((key: string) => storeData[key] ?? []),
    set: vi.fn((key: string, value: unknown) => { storeData[key] = value; }),
  },
}));

// Mock vector-store
vi.mock("../vector-store", () => ({
  vectorStore: {
    getAllIds: vi.fn(() => []),
    get: vi.fn(),
    search: vi.fn(() => []),
  },
}));

import {
  createCollection,
  updateCollection,
  deleteCollection,
  getCollections,
  addNoteToCollection,
  removeNoteFromCollection,
  mergeCollections,
  dismissCollection,
} from "../collections";

beforeEach(() => {
  vi.clearAllMocks();
  storeData = { collections: [] };
});

describe("createCollection", () => {
  it("creates a collection with given name", () => {
    const col = createCollection({ name: "Work" });
    expect(col.name).toBe("Work");
    expect(col.id).toBeTruthy();
    expect(col.noteIds).toEqual([]);
    expect(col.suggested).toBe(false);
    expect(col.dismissed).toBe(false);
  });

  it("creates with description and noteIds", () => {
    const col = createCollection({ name: "Research", description: "Physics papers", noteIds: ["n1", "n2"] });
    expect(col.description).toBe("Physics papers");
    expect(col.noteIds).toEqual(["n1", "n2"]);
  });

  it("persists to store", () => {
    createCollection({ name: "Test" });
    const stored = storeData.collections as unknown[];
    expect(stored).toHaveLength(1);
  });
});

describe("updateCollection", () => {
  it("updates name and description", () => {
    const col = createCollection({ name: "Old" });
    const updated = updateCollection(col.id, { name: "New", description: "Updated" });
    expect(updated?.name).toBe("New");
    expect(updated?.description).toBe("Updated");
  });

  it("returns null for non-existent id", () => {
    expect(updateCollection("fake", { name: "x" })).toBeNull();
  });
});

describe("deleteCollection", () => {
  it("removes collection from store", () => {
    const col = createCollection({ name: "Delete me" });
    expect(deleteCollection(col.id)).toBe(true);
    expect((storeData.collections as unknown[]).length).toBe(0);
  });

  it("returns false for non-existent id", () => {
    expect(deleteCollection("fake")).toBe(false);
  });
});

describe("getCollections", () => {
  it("excludes dismissed collections", () => {
    const col = createCollection({ name: "A" });
    createCollection({ name: "B" });
    dismissCollection(col.id);
    const result = getCollections();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("B");
  });

  it("returns empty for empty store", () => {
    expect(getCollections()).toHaveLength(0);
  });
});

describe("addNoteToCollection", () => {
  it("adds a note id", () => {
    const col = createCollection({ name: "Test" });
    const updated = addNoteToCollection(col.id, "note1");
    expect(updated?.noteIds).toContain("note1");
  });

  it("deduplicates note ids", () => {
    const col = createCollection({ name: "Test", noteIds: ["n1"] });
    const updated = addNoteToCollection(col.id, "n1");
    expect(updated?.noteIds.filter((id: string) => id === "n1")).toHaveLength(1);
  });

  it("returns null for non-existent collection", () => {
    expect(addNoteToCollection("fake", "n1")).toBeNull();
  });
});

describe("removeNoteFromCollection", () => {
  it("removes a note id", () => {
    const col = createCollection({ name: "Test", noteIds: ["n1", "n2"] });
    const updated = removeNoteFromCollection(col.id, "n1");
    expect(updated?.noteIds).toEqual(["n2"]);
  });

  it("returns null for non-existent collection", () => {
    expect(removeNoteFromCollection("fake", "n1")).toBeNull();
  });
});

describe("mergeCollections", () => {
  it("combines noteIds and deletes source", () => {
    const source = createCollection({ name: "A", noteIds: ["n1", "n2"] });
    const target = createCollection({ name: "B", noteIds: ["n2", "n3"] });
    const merged = mergeCollections(source.id, target.id);
    expect(merged?.noteIds.sort()).toEqual(["n1", "n2", "n3"]);
    // Source should be deleted
    const all = storeData.collections as Array<{ id: string }>;
    expect(all.find((c) => c.id === source.id)).toBeUndefined();
  });

  it("returns null for same source and target", () => {
    const col = createCollection({ name: "X" });
    expect(mergeCollections(col.id, col.id)).toBeNull();
  });

  it("returns null for non-existent ids", () => {
    expect(mergeCollections("fake1", "fake2")).toBeNull();
  });
});

describe("dismissCollection", () => {
  it("sets dismissed to true", () => {
    const col = createCollection({ name: "Dismiss me" });
    dismissCollection(col.id);
    const all = storeData.collections as Array<{ id: string; dismissed: boolean }>;
    const found = all.find((c) => c.id === col.id);
    expect(found?.dismissed).toBe(true);
  });
});
