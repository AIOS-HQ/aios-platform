import "server-only";

import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/utils";
import type { BrainKind, PersonalBrainEntry } from "@/types/database";

/** List the current user's Personal Brain entries. */
export async function listBrainEntries(opts?: {
  kind?: BrainKind | "all";
  query?: string;
  limit?: number;
}): Promise<PersonalBrainEntry[]> {
  const supabase = await createClient();
  let q = supabase.from("personal_brains").select("*");
  if (opts?.kind && opts.kind !== "all") {
    q = q.eq("kind", opts.kind);
  }
  const term = opts?.query ? sanitizeSearch(opts.query) : "";
  if (term) {
    q = q.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 500);
  if (error) console.error("[data/brain] listBrainEntries", error);
  return (data as PersonalBrainEntry[] | null) ?? [];
}
