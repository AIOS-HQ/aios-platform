import "server-only";

import { resilientFetch } from "./http";

/**
 * Text embeddings for semantic memory (Julius + memories).
 *
 * Uses OpenAI's embedding API. Model + dimension MUST match the `vector(1536)`
 * columns created in 20260625000000_semantic_memory.sql. Fully graceful: if no
 * OpenAI key is configured (or any call fails) `embed` returns null and callers
 * fall back to keyword retrieval — semantic memory is an enhancement, never a
 * hard dependency. Independent of AI_PROVIDER: embeddings only need an OpenAI
 * key, so semantic recall works even when the chat provider is Anthropic.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

/** True when semantic features can run (an OpenAI key is configured). */
export function embeddingsEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** pgvector text literal for an embedding (insert/update + RPC args). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Embed a single string. Returns null when embeddings are disabled, the input
 * is empty, or the request fails / returns an unexpected shape.
 */
export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  const input = (text ?? "").trim().slice(0, 8000);
  if (!key || !input) return null;
  try {
    const res = await resilientFetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length === EMBEDDING_DIM
      ? (vec as number[])
      : null;
  } catch {
    return null;
  }
}
