/** Shared, serializable types for the Julius semantic-search panel. */
export interface JuliusHit {
  id: string;
  title: string;
  content: string;
  kind: string;
  agent: string;
  importance: number;
  /** Cosine similarity 0..1 when semantic; null for keyword fallback. */
  similarity: number | null;
}

export type JuliusScope = "company" | "global";
