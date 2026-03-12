import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { findSimilar } from "./embeddings";

/**
 * In-memory vector index with async JSON file persistence.
 * Stores note embeddings separately from electron-store for performance.
 *
 * NOTE: If note cap increases beyond 1000, consider switching to binary
 * format (MessagePack or base64-encoded Float32Array) for faster I/O.
 */

const FLUSH_DEBOUNCE_MS = 5000;

class VectorStore {
  private embeddings = new Map<string, number[]>();
  private staleIds = new Set<string>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private filePath: string = "";

  async load(): Promise<void> {
    this.filePath = path.join(app.getPath("userData"), "note-embeddings.json");

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = await fs.promises.readFile(this.filePath, "utf-8");
        const data = JSON.parse(raw) as Record<string, number[]>;
        for (const [id, embedding] of Object.entries(data)) {
          this.embeddings.set(id, embedding);
        }
        console.log(`[VectorStore] Loaded ${this.embeddings.size} embeddings`);
      } else {
        console.log("[VectorStore] No existing embeddings file — starting fresh");
      }
    } catch (error) {
      console.error("[VectorStore] Failed to load embeddings:", error);
      // Start with empty store — embeddings will be regenerated
    }
  }

  add(noteId: string, embedding: number[]): void {
    this.embeddings.set(noteId, embedding);
    this.staleIds.delete(noteId);
    this.scheduleDirtyFlush();
  }

  remove(noteId: string): void {
    this.embeddings.delete(noteId);
    this.staleIds.delete(noteId);
    this.scheduleDirtyFlush();
  }

  search(
    queryEmbedding: number[],
    topK: number,
    excludeId?: string,
  ): Array<{ id: string; score: number }> {
    return findSimilar(queryEmbedding, this.embeddings, topK, excludeId);
  }

  has(noteId: string): boolean {
    return this.embeddings.has(noteId);
  }

  get(noteId: string): number[] | undefined {
    return this.embeddings.get(noteId);
  }

  markStale(noteId: string): void {
    this.staleIds.add(noteId);
  }

  getStaleIds(): string[] {
    return [...this.staleIds];
  }

  getAllIds(): string[] {
    return [...this.embeddings.keys()];
  }

  get size(): number {
    return this.embeddings.size;
  }

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return; // already scheduled
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.flush().catch((err) =>
          console.error("[VectorStore] Flush error:", err),
        );
      }
    }, FLUSH_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (!this.filePath) return;
    this.dirty = false;

    const obj: Record<string, number[]> = {};
    for (const [id, embedding] of this.embeddings) {
      obj[id] = embedding;
    }

    await fs.promises.writeFile(this.filePath, JSON.stringify(obj), "utf-8");
    console.log(`[VectorStore] Flushed ${this.embeddings.size} embeddings to disk`);
  }
}

export const vectorStore = new VectorStore();
