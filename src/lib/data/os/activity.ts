import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ActivityEvent } from "@/types/database";

/** List recent activity-feed events, newest first (optionally per company). */
export async function listActivity(opts?: {
  companyId?: string;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  let q = supabase.from("activity_events").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) console.error("[data/os/activity] listActivity", error);
  return (data as ActivityEvent[] | null) ?? [];
}
