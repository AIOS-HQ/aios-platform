import "server-only";

import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/utils";
import type { PersonalNote } from "@/types/database";

/** List the current user's notes, optionally filtered by a search term. */
export async function listNotes(
  query?: string,
  limit = 500,
): Promise<PersonalNote[]> {
  const supabase = await createClient();
  let q = supabase.from("personal_notes").select("*");
  const term = query ? sanitizeSearch(query) : "";
  if (term) {
    q = q.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  }
  const { data } = await q
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data as PersonalNote[] | null) ?? [];
}
