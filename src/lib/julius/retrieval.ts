import "server-only";

import { createClient } from "@/lib/supabase/server";
import { embed, embeddingsEnabled, toVectorLiteral } from "@/lib/ai/embeddings";
import type { JuliusEntry, JuliusKind } from "@/lib/julius/service";

/**
 * Julius Intelligence — semantic retrieval extensions layered additively on the
 * Julius org brain (service.ts). Everything here is owner/company-scoped via the
 * RLS server client and the SECURITY INVOKER match functions; embeddings reuse
 * the shared OpenAI embedder (src/lib/ai/embeddings.ts) and degrade gracefully
 * (empty result / no-op) whenever embeddings are unavailable.
 *
 * Complements service.ts (record/list/semantic-search) with the pieces it did
 * not yet cover: knowledge indexing (embedding backfill), similar-decision
 * search (by an existing entry's embedding), cross-project retrieval (across all
 * of a user's companies), and a combined relevance ranker.
 */

interface MatchRow {
  id: string;
  agent: string;
  kind: string;
  title: string;
  content: string;
  importance: number;
  created_at: string | null;
  similarity: number;
}
interface GlobalMatchRow extends MatchRow {
  company_id: string;
}

function toEntry(userId: string, companyId: string, r: MatchRow): JuliusEntry {
  return {
    id: r.id,
    user_id: userId,
    company_id: companyId,
    agent: r.agent,
    kind: r.kind as JuliusKind,
    title: r.title,
    content: r.content,
    refs: {},
    importance: r.importance,
    similarity: r.similarity,
    created_at: r.created_at ?? "",
    updated_at: "",
  };
}

// --- Knowledge indexing: embedding backfill --------------------------------

export interface JuliusBackfillResult {
  /** Whether semantic embeddings are configured (OPENAI_API_KEY present). */
  enabled: boolean;
  scanned: number;
  embedded: number;
  failed: number;
}

/**
 * Embed every un-embedded Julius entry for a user (knowledge indexing). Uses the
 * RLS server client, so it only ever touches the caller's own rows. No-op when
 * embeddings are disabled (no OpenAI key) — reported via `enabled: false`, which
 * doubles as a diagnostic for whether the key is configured in this environment.
 */
export async function backfillJuliusEmbeddings(
  userId: string,
  limit = 500,
): Promise<JuliusBackfillResult> {
  const result: JuliusBackfillResult = {
    enabled: embeddingsEnabled(),
    scanned: 0,
    embedded: 0,
    failed: 0,
  };
  if (!result.enabled) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("julius_entries")
    .select("id,title,content")
    .eq("user_id", userId)
    .is("embedding", null)
    .limit(limit);
  if (error || !data) return result;

  const rows = data as { id: string; title: string; content: string }[];
  result.scanned = rows.length;

  for (const r of rows) {
    const vec = await embed(`${r.title}\n${r.content}`);
    if (!vec) {
      result.failed++;
      continue;
    }
    const { error: ue } = await supabase
      .from("julius_entries")
      .update({ embedding: toVectorLiteral(vec) })
      .eq("id", r.id)
      .eq("user_id", userId);
    if (ue) result.failed++;
    else result.embedded++;
  }
  return result;
}

// --- Similar-decision / similar-entry search -------------------------------

/**
 * Find entries semantically similar to an existing one (e.g. "decisions like
 * this"). Uses the source entry's stored embedding via match_julius_by_entry.
 * Returns [] when the source has no embedding yet (run the backfill first).
 */
export async function findSimilarJuliusEntries(
  userId: string,
  companyId: string,
  sourceId: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_julius_by_entry", {
    source_id: sourceId,
    match_user_id: userId,
    match_company_id: companyId,
    match_count: limit,
  });
  if (error || !data) return [];
  return (data as MatchRow[]).map((r) => toEntry(userId, companyId, r));
}

// --- Cross-project (cross-company) retrieval -------------------------------

/**
 * Semantic retrieval across ALL of a user's companies (cross-project knowledge
 * recall). Embeds the query and calls match_julius_entries_global. Returns []
 * when embeddings are unavailable — global recall is a semantic-only enhancement
 * (per-company retrieval in service.ts retains its keyword fallback).
 */
export async function searchJuliusAcrossCompanies(
  userId: string,
  query: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  const term = (query ?? "").trim();
  if (!term) return [];
  const vec = await embed(term);
  if (!vec) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_julius_entries_global", {
    query_embedding: toVectorLiteral(vec),
    match_user_id: userId,
    match_count: limit,
  });
  if (error || !data) return [];
  return (data as GlobalMatchRow[]).map((r) => toEntry(userId, r.company_id, r));
}

// --- Memory ranking ---------------------------------------------------------

/**
 * Combined relevance ranking: semantic similarity (0..1), importance (1..5), and
 * recency decay (~30-day scale). Pure + deterministic given `now`. Similarity
 * defaults to a neutral 0.5 for entries without a score (e.g. keyword reads), so
 * the ranker is safe to apply to any Julius result set.
 */
export function rankJuliusEntries(entries: JuliusEntry[], now: number = Date.now()): JuliusEntry[] {
  const score = (e: JuliusEntry): number => {
    const sim = typeof e.similarity === "number" ? e.similarity : 0.5;
    const imp = (Math.min(5, Math.max(1, e.importance)) - 1) / 4;
    const ageMs = e.created_at ? now - new Date(e.created_at).getTime() : 30 * 86_400_000;
    const ageDays = Math.max(0, ageMs / 86_400_000);
    const recency = Math.exp(-ageDays / 30);
    return 0.6 * sim + 0.25 * imp + 0.15 * recency;
  };
  return [...entries].sort((a, b) => score(b) - score(a));
}
