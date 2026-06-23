import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Julius — AIOS organizational brain service (server-only).
 *
 * Shared, company-scoped organizational memory every AIOS agent can read from
 * and write to (where appropriate). Reads/writes go through the RLS server
 * client (owner-scoped) and are always filtered by company_id, so one company's
 * brain never bleeds into another (AIOS vs AirBid stay separate). Degrades
 * gracefully if the migration hasn't been applied yet.
 *
 * Atlas is the primary steward (see src/lib/workforce/registry.ts), but every
 * agent with read_write access records relevant work here so the rest of the
 * workforce stays aware of it.
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
  return (data as JuliusEntry | null) ?? null;
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
 * Cross-agent retrieval hook: the shared organizational context any AIOS agent
 * reads before acting, so each agent understands relevant work performed by the
 * others within the same company.
 */
export async function getJuliusContext(
  userId: string,
  companyId: string,
  query?: string,
  limit = 10,
): Promise<JuliusEntry[]> {
  return listJuliusEntries(userId, companyId, { query, limit });
}
