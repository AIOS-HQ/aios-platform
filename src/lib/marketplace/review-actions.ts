"use server";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/**
 * Marketplace reviews — submit/update a rating (1–5 stars) + optional written
 * review for a marketplace item. One rating per user per item: updates the
 * caller's existing rating if present, else inserts. Owner-scoped by RLS
 * (auth.uid() = user_id via the rater_* policies); marketplace assets carry no
 * secrets. Reuses the existing marketplace_item_ratings table — no schema change.
 */

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
}

export async function submitReview(
  itemId: string,
  stars: number,
  comment: string,
): Promise<SubmitReviewResult> {
  const user = await requireUser();
  const s = Math.min(5, Math.max(1, Math.round(Number(stars) || 0)));
  const text = (comment ?? "").trim().slice(0, 2000);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("marketplace_item_ratings")
    .select("id")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("marketplace_item_ratings")
      .update({ stars: s, comment: text || null })
      .eq("id", (existing as { id: string }).id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("marketplace_item_ratings")
    .insert({ item_id: itemId, user_id: user.id, stars: s, comment: text || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}
