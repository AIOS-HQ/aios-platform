import "server-only";

import { createClient } from "@/lib/supabase/server";
import { embed, embeddingsEnabled, toVectorLiteral } from "@/lib/ai/embeddings";

/**
 * Julius — AIOS organizational brain service (server-only).
 *
 * Shared, company-scoped organizational memory every AIOS agent can read from
 * and write to (where appropriate). Reads/writes go through the RLS server
 * client (owner-scoped) and are always filtered by company_id, so one company's
 * brain never bleeds into another (AIOS vs AirBid stay separate). Degrades
 * gracefully if the migration hasn't been applied yet.
 *
 * Semantic recall (pgvector) is layered on additively: entries are embedded on
 * write (best-effort) and retrieved by meaning via match_julius_entries, with a
 * keyword fallback whenever embeddings are unavailable. Atlas is the primary
 * steward (see src/lib/workforce/registry.ts), but every agent with read_write
 * access records relevant work here so the rest of the workforce stays aware.
 */

export const JULIUS_KINDS = [
  "objective",
  "decision",
  "document",
  "activity",
  "relationship",
  "historical",
  "context",
  "knowledge",
] as const;

export type JuliusKind = (typeof JULIUS_KINDS)[number];

export function isJuliusKind(value: string): value is JuliusKind {
  return (JULIUS_KINDS as readonly string[]).includes(value);
}

export interface JuliusEntry {
  id: string;
  user_id: string;
  company_id: string;
  agent: string;
  kind: JuliusKind;
  title: string;
  content: string;
  refs: Record<string, unknown>;
  importance: number;
  created_at: string;
  updated_at: string;
  /** Cosine similarity (0..1) when returned by semantic search; absent for keyword reads. */
  similarity?: number;
}

export interface RecordJuliusInput {
  userId: string;
  companyId: string;
  /** Authoring AIOS agent key (e.g. "atlas", "harmony"). Defaults to atlas. */
  agent?: string;
  kind: JuliusKind;
  title: string;
  content: string;
  refs?: Record<string, unknown>;
  importance?: number;
}

export async function recordJuliusEntry(
  input: RecordJuliusInput,
): Promise<JuliusEntry | null> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return null;

  const supabase = await createClient();
  const importance = Math.min(5, Math.max(1, Math.round(input.importance ?? 3)));

  const { data, error } = await supabase
    .from("julius_entries")
    .insert({
      user_id: input.userId,
      company_id: input.companyId,
      agent: input.agent ?? "atlas",
      kind: input.kind,
      title: title.slice(0, 300),
      content: content.slice(0, 8000),
      refs: input.refs ?? {},
      importance,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // Table may not exist yet (migration not applied) — degrade gracefully.
    console.error("[julius] recordJuliusEntry", error.message);
    return null;
  }
  const entry = (data as JuliusEntry | null) ?? null;

  // Embed-on-write (best-effort): a separate update so a missing embedding
  // column (un-migrated env) or a failed embedding never blocks the write.
  if (entry && embeddingsEnabled()) {
    const vec = await embed(`${title}\n${content}`);
    if (vec) {
      const { error: embErr } = await supabase
        .from("julius_entries")
        .update({ embedding: toVectorLiteral(vec) })
        .eq("id", entry.id)
        .eq("user_id", input.userId);
      if (embErr) console.error("[julius] embed-on-write", embErr.message);
    }
  }

  return entry;
}

export interface ListJuliusOptions {
  kind?: JuliusKind;
  /** Case-insensitive keyword match on content. */
  query?: string;
  limit?: number;
}

export async function listJuliusEntries(
  userId: string,
  companyId: string,
  options: ListJuliusOptions = {},
): Promise<JuliusEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("julius_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId);

  if (options.kind) q = q.eq("kind", options.kind);
  const term = options.query?.trim();
  if (term) q = q.ilike("content", `%${term}%`);

  q = q
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  const { data, error } = await q;
  if (error) {
    console.error("[julius] listJuliusEntries", error.message);
    return [];
  }
  return (data as JuliusEntry[] | null) ?? [];
}

/**
 * Semantic retrieval over Julius — retrieve by MEANING (pgvector cosine via the
 * match_julius_entries function), ranked by confidence (similarity). Falls back
 * to keyword search when embeddings are unavailable or the RPC is missing (e.g.
 * migration not yet applied), so callers always get relevant context.
 */
export async function searchJuliusSemantic(
  userId: string,
  companyId: string,
  query: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  const term = (query ?? "").trim();
  if (!term) return listJuliusEntries(userId, companyId, { limit });

  const vec = await embed(term);
  if (!vec) return listJuliusEntries(userId, companyId, { query: term, limit });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_julius_entries", {
    query_embedding: toVectorLiteral(vec),
    match_user_id: userId,
    match_company_id: companyId,
    match_count: limit,
  });
  if (error || !data) {
    console.error("[julius] searchJuliusSemantic", error?.message ?? "no data");
    return listJuliusEntries(userId, companyId, { query: term, limit });
  }

  const rows = data as Array<{
    id: string;
    agent: string;
    kind: JuliusKind;
    title: string;
    content: string;
    importance: number;
    similarity: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    user_id: userId,
    company_id: companyId,
    agent: r.agent,
    kind: r.kind,
    title: r.title,
    content: r.content,
    refs: {},
    importance: r.importance,
    similarity: r.similarity,
    created_at: "",
    updated_at: "",
  }));
}

/**
 * Cross-agent retrieval hook: the shared organizational context any AIOS agent
 * reads before acting, so each agent understands relevant work performed by the
 * others within the same company. Semantic-first when a query is provided.
 */
export async function getJuliusContext(
  userId: string,
  companyId: string,
  query?: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  if (query && query.trim()) {
    return searchJuliusSemantic(userId, companyId, query, limit);
  }
  return listJuliusEntries(userId, companyId, { limit });
}
