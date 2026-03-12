import OpenAI from "openai";

/**
 * Embedding generation and vector similarity operations.
 * Uses Fireworks AI's nomic-embed-text-v1.5 model (768-dimensional vectors)
 * via their OpenAI-compatible API endpoint.
 */

const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

function getFireworksClient(): OpenAI {
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Fireworks API key not configured. Set FIREWORKS_API_KEY env var.",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.fireworks.ai/inference/v1",
  });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getFireworksClient();
  const response = await client.embeddings.create({
    input: text,
    model: EMBEDDING_MODEL,
  });
  return response.data[0].embedding as number[];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getFireworksClient();
  const response = await client.embeddings.create({
    input: texts,
    model: EMBEDDING_MODEL,
  });
  // Fireworks returns embeddings in the same order as input
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
