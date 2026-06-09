import "server-only";

import { createClient } from "@/lib/supabase/server";
import { clampImportance, scoreImportance } from "@/lib/memory/scoring";
import type { MemoryKind, MemoryRecord } from "@/lib/memory/types";

/**
 * Harmony Memory Engine service (server-only).
 *
 * Reads/writes go through the RLS-scoped server client, so a user can only ever
 * see or change their OWN memories — there is no cross-user access path. This is
 * the foundation other layers build on: `recordMemory` is the write hook (used
 * by user actions now, and by tools/auto-capture later); `getRelevantMemories`
 * is the retrieval hook the assistant can call before responding.
 */

export interface RecordMemoryInput {
  userId: string;
  kind: MemoryKind;
  content: string;
  /** Origin label, e.g. "manual" | "system" | "task" | "approval". */
  source?: string;
  /** Optional id of the originating entity. */
  sourceId?: string | null;
  /** Override the scored importance (1..5). */
  importance?: number;
  metadata?: Record<string, unknown>;
}

export async function recordMemory(input: RecordMemoryInput): Promise<MemoryRecord | null> {
  const content = input.content.trim();
  if (!content) return null;

  const supabase = await createClient();
  const importance = clampImportance(input.importance ?? scoreImportance(input.kind));

  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      content: content.slice(0, 4000),
      source: input.source ?? "manual",
      source_id: input.sourceId ?? null,
      importance,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // Table may not exist yet (migration not applied) — degrade gracefully.
    console.error("[memory] recordMemory", error.message);
    return null;
  }
  return (data as MemoryRecord | null) ?? null;
}

export interface ListMemoriesOptions {
  kind?: MemoryKind;
  /** Case-insensitive keyword match on content. */
  query?: string;
  limit?: number;
}

export async function listMemories(
  userId: string,
  options: ListMemoriesOptions = {},
): Promise<MemoryRecord[]> {
  const supabase = await createClient();
  let q = supabase.from("memories").select("*").eq("user_id", userId);

  if (options.kind) q = q.eq("kind", options.kind);
  const term = options.query?.trim();
  if (term) q = q.ilike("content", `%${term}%`);

  q = q
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  const { data, error } = await q;
  if (error) {
    console.error("[memory] listMemories", error.message);
    return [];
  }
  return (data as MemoryRecord[] | null) ?? [];
}

/**
 * Retrieval hook for Harmony's assistant: the most relevant memories for the
 * current user, ranked by importance then recency, optionally filtered by a
 * keyword. (No vector search yet — this is the safe v1.)
 */
export async function getRelevantMemories(
  userId: string,
  query?: string,
  limit = 8,
): Promise<MemoryRecord[]> {
  return listMemories(userId, { query, limit });
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("[memory] deleteMemory", error.message);
    return false;
  }
  return true;
}
