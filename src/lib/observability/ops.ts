import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Operational logging (server-only) — production visibility for autonomous
 * execution. Every call mirrors to the server console first (so nothing is ever
 * lost, even if the DB write fails), then best-effort persists an ops_events row
 * the Founder Command Center can surface and the founder can resolve.
 *
 * Writes prefer the service-role client so failures are captured even in
 * sessionless/autonomous contexts (cron, webhooks); falls back to the RLS client.
 * Reads are owner-scoped (RLS). Degrades gracefully until the migration applies.
 */

export type OpsLevel = "info" | "warn" | "error";

export interface OpsEvent {
  id: string;
  user_id: string;
  company_id: string | null;
  level: OpsLevel;
  source: string;
  message: string;
  context: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export async function recordOpsEvent(input: {
  userId: string;
  level: OpsLevel;
  source: string;
  message: string;
  companyId?: string | null;
  context?: Record<string, unknown>;
}): Promise<void> {
  // 1) Never-silent: always mirror to the server log.
  const line = `[ops:${input.level}] ${input.source} — ${input.message}`;
  if (input.level === "error") console.error(line);
  else if (input.level === "warn") console.warn(line);
  else console.info(line);

  if (!input.userId) return;

  // 2) Best-effort durable record (admin so autonomous contexts still capture it).
  try {
    const supabase = createAdminClient() ?? (await createClient());
    await supabase.from("ops_events").insert({
      user_id: input.userId,
      company_id: input.companyId ?? null,
      level: input.level,
      source: input.source.slice(0, 120),
      message: input.message.slice(0, 2000),
      context: input.context ?? {},
    });
  } catch (e) {
    console.error("[observability] recordOpsEvent persist failed", e);
  }
}

export async function listOpsEvents(
  userId: string,
  opts?: { level?: OpsLevel; limit?: number; unresolvedOnly?: boolean },
): Promise<OpsEvent[]> {
  if (!userId) return [];
  const supabase = await createClient();
  let q = supabase.from("ops_events").select("*").eq("user_id", userId);
  if (opts?.level) q = q.eq("level", opts.level);
  if (opts?.unresolvedOnly) q = q.eq("resolved", false);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 50);

  const { data, error } = await q;
  if (error) {
    console.error("[observability] listOpsEvents", error.message);
    return [];
  }
  return (data as OpsEvent[] | null) ?? [];
}

/** Count unresolved operational issues (optionally by level) for the cockpit. */
export async function countUnresolvedOps(
  userId: string,
  level?: OpsLevel,
): Promise<number> {
  if (!userId) return 0;
  const supabase = await createClient();
  let q = supabase
    .from("ops_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("resolved", false);
  if (level) q = q.eq("level", level);
  const { count, error } = await q;
  if (error) {
    console.error("[observability] countUnresolvedOps", error.message);
    return 0;
  }
  return count ?? 0;
}
