import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ContentItem, ContentItemStatus } from "@/types/database";

/** List content items (calendar entries), optionally scoped. Newest schedule first. */
export async function listContentItems(opts?: {
  companyId?: string;
  status?: ContentItemStatus;
}): Promise<ContentItem[]> {
  const supabase = await createClient();
  let q = supabase.from("content_items").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) console.error("[data/content/items] listContentItems", error);
  return (data as ContentItem[] | null) ?? [];
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/content/items] getContentItem", error);
  return (data as ContentItem | null) ?? null;
}
