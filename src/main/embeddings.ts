import { getGroqClient } from "./groq-client";

/**
 * Embedding generation and vector similarity operations.
 * Uses Groq's nomic-embed-text-v1_5 model (768-dimensional vectors).
 */

const EMBEDDING_MODEL = "nomic-embed-text-v1_5";

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGroqClient();
  const response = await client.embeddings.create({
    input: text,
    model: EMBEDDING_MODEL,
  });
  return response.data[0].embedding as number[];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getGroqClient();
  const response = await client.embeddings.create({
    input: texts,
    model: EMBEDDING_MODEL,
  });
  // Groq returns embeddings in the same order as input
  return response.data.map((d) => d.embedding as number[]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function findSimilar(
  query: number[],
  candidates: Map<string, number[]>,
  topK: number,
  excludeId?: string,
): Array<{ id: string; score: number }> {
  const scored: Array<{ id: string; score: number }> = [];

  for (const [id, embedding] of candidates) {
    if (id === excludeId) continue;
    scored.push({ id, score: cosineSimilarity(query, embedding) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
