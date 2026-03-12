import { randomUUID } from "crypto";
import store, { Collection } from "./store";
import { vectorStore } from "./vector-store";
import { getGroqClient } from "./groq-client";

export function createCollection(params: {
  name: string;
  description?: string;
  noteIds?: string[];
}): Collection {
  const now = Date.now();
  const collection: Collection = {
    id: randomUUID(),
    name: params.name,
    description: params.description ?? "",
    noteIds: params.noteIds ?? [],
    suggested: false,
    dismissed: false,
    createdAt: now,
    updatedAt: now,
  };

  const collections = store.get("collections") as Collection[];
  collections.push(collection);
  store.set("collections", collections);
  return collection;
}

export function updateCollection(
  id: string,
  updates: Partial<Pick<Collection, "name" | "description" | "noteIds" | "dismissed">>,
): Collection | null {
  const collections = store.get("collections") as Collection[];
  const idx = collections.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const updated = { ...collections[idx], ...updates, updatedAt: Date.now() };
  collections[idx] = updated;
  store.set("collections", collections);
  return updated;
}

export function deleteCollection(id: string): boolean {
  const collections = store.get("collections") as Collection[];
  const filtered = collections.filter((c) => c.id !== id);
  if (filtered.length === collections.length) return false;
  store.set("collections", filtered);
  return true;
}

export function getCollections(): Collection[] {
  const collections = store.get("collections") as Collection[];
  return collections.filter((c) => !c.dismissed);
}

export function addNoteToCollection(collectionId: string, noteId: string): Collection | null {
  const collections = store.get("collections") as Collection[];
  const idx = collections.findIndex((c) => c.id === collectionId);
  if (idx === -1) return null;

  const noteIds = [...new Set([...collections[idx].noteIds, noteId])];
  collections[idx] = { ...collections[idx], noteIds, updatedAt: Date.now() };
  store.set("collections", collections);
  return collections[idx];
}

export function removeNoteFromCollection(collectionId: string, noteId: string): Collection | null {
  const collections = store.get("collections") as Collection[];
  const idx = collections.findIndex((c) => c.id === collectionId);
  if (idx === -1) return null;

  const noteIds = collections[idx].noteIds.filter((id) => id !== noteId);
  collections[idx] = { ...collections[idx], noteIds, updatedAt: Date.now() };
  store.set("collections", collections);
  return collections[idx];
}

export function mergeCollections(sourceId: string, targetId: string): Collection | null {
  const collections = store.get("collections") as Collection[];
  const sourceIdx = collections.findIndex((c) => c.id === sourceId);
  const targetIdx = collections.findIndex((c) => c.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1 || sourceId === targetId) return null;

  const mergedNoteIds = [...new Set([...collections[targetIdx].noteIds, ...collections[sourceIdx].noteIds])];
  collections[targetIdx] = { ...collections[targetIdx], noteIds: mergedNoteIds, updatedAt: Date.now() };

  // Remove source
  const result = collections[targetIdx];
  const filtered = collections.filter((c) => c.id !== sourceId);
  store.set("collections", filtered);
  return result;
}

export function dismissCollection(id: string): void {
  updateCollection(id, { dismissed: true });
}

export async function suggestCollections(): Promise<Collection[]> {
  const allIds = vectorStore.getAllIds();
  if (allIds.length < 3) return []; // Need at least 3 notes

  // Build neighbor map: for each note, find its 3 nearest neighbors
  const neighborMap = new Map<string, string[]>();
  for (const id of allIds) {
    const embedding = vectorStore.get(id);
    if (!embedding) continue;
    const neighbors = vectorStore.search(embedding, 3, id);
    neighborMap.set(id, neighbors.map((n) => n.id));
  }

  // Find clusters: notes that mutually appear in each other's top-3
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const id of allIds) {
    if (visited.has(id)) continue;
    const cluster = new Set<string>([id]);
    const neighbors = neighborMap.get(id) ?? [];

    for (const nId of neighbors) {
      const nNeighbors = neighborMap.get(nId) ?? [];
      if (nNeighbors.includes(id)) {
        cluster.add(nId);
        // Also check second-degree mutual connections
        for (const nnId of nNeighbors) {
          const nnNeighbors = neighborMap.get(nnId) ?? [];
          if (nnNeighbors.includes(nId) || nnNeighbors.includes(id)) {
            cluster.add(nnId);
          }
        }
      }
    }

    if (cluster.size >= 3) {
      clusters.push([...cluster]);
      cluster.forEach((cId) => visited.add(cId));
    }
  }

  if (clusters.length === 0) return [];

  // Filter clusters that overlap >80% with existing collections
  const existingCollections = getCollections();
  const filteredClusters = clusters.filter((cluster) => {
    const clusterSet = new Set(cluster);
    return !existingCollections.some((col) => {
      const overlap = col.noteIds.filter((id) => clusterSet.has(id)).length;
      return overlap / Math.max(clusterSet.size, 1) > 0.8;
    });
  });

  // Generate names for clusters via LLM
  const suggested: Collection[] = [];
  const { getNotes } = await import("./notes");
  const allNotes = getNotes({ includeArchived: true });
  const noteMap = new Map(allNotes.map((n) => [n.id, n]));

  for (const cluster of filteredClusters.slice(0, 5)) {
    const clusterNotes = cluster
      .map((id) => noteMap.get(id))
      .filter(Boolean)
      .slice(0, 5);

    const titles = clusterNotes.map((n) => n!.title).join(", ");
    const snippets = clusterNotes.map((n) => (n!.cleanContent || n!.content).slice(0, 100)).join("\n");

    try {
      const client = getGroqClient();
      const response = await client.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "Generate a short collection name (2-4 words) and one-line description for this group of related notes. Return JSON: {\"name\": \"...\", \"description\": \"...\"}",
          },
          {
            role: "user",
            content: `Note titles: ${titles}\nSnippets:\n${snippets}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw);
      if (typeof parsed.name === "string") {
        const now = Date.now();
        const collection: Collection = {
          id: randomUUID(),
          name: parsed.name,
          description: typeof parsed.description === "string" ? parsed.description : "",
          noteIds: cluster,
          suggested: true,
          dismissed: false,
          createdAt: now,
          updatedAt: now,
        };

        const collections = store.get("collections") as Collection[];
        collections.push(collection);
        store.set("collections", collections);
        suggested.push(collection);
      }
    } catch {
      // Skip this cluster if LLM fails
    }
  }

  return suggested;
}
