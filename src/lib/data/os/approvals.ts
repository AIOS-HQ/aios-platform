import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Approval, ApprovalStatus } from "@/types/database";

/** List approvals, optionally scoped to a company and/or status. */
export async function listApprovals(opts?: {
  companyId?: string;
  status?: ApprovalStatus;
}): Promise<Approval[]> {
  const supabase = await createClient();
  let q = supabase.from("approvals").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) console.error("[data/os/approvals] listApprovals", error);
  return (data as Approval[] | null) ?? [];
}

/**
 * Count pending approvals for the Command Center badge / sidebar.
 *
 * UNION during the autonomy-spine migration: the founder's pending approvals
 * live across TWO stores — the legacy `approvals` table (comms message, A2A,
 * and manually-created approvals) and the new `approval_payloads` spine (work
 * items, Mason, connectors). Counting both keeps the badge accurate: a
 * spine-only count would undercount comms/A2A/manual approvals, while the prior
 * legacy-only count undercounts everything routed through the spine after
 * PR #308. Both reads are RLS owner-scoped.
 */
export async function countPendingApprovals(): Promise<number> {
  const supabase = await createClient();
  const [legacy, spine] = await Promise.all([
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("approval_payloads")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  if (legacy.error) console.error("[data/os/approvals] countPendingApprovals(legacy)", legacy.error);
  if (spine.error) console.error("[data/os/approvals] countPendingApprovals(spine)", spine.error);
  return (legacy.count ?? 0) + (spine.count ?? 0);
}

/**
 * Count decided (approved or rejected) approvals across both stores. Used by
 * the first-run checklist. Same UNION rationale as countPendingApprovals.
 */
export async function countDecidedApprovals(): Promise<number> {
  const supabase = await createClient();
  const [legacy, spine] = await Promise.all([
    supabase.from("approvals").select("id", { count: "exact", head: true }).neq("status", "pending"),
    supabase
      .from("approval_payloads")
      .select("id", { count: "exact", head: true })
      .neq("status", "pending"),
  ]);
  if (legacy.error) console.error("[data/os/approvals] countDecidedApprovals(legacy)", legacy.error);
  if (spine.error) console.error("[data/os/approvals] countDecidedApprovals(spine)", spine.error);
  return (legacy.count ?? 0) + (spine.count ?? 0);
}
export async function countUnreadLifeOperatorMessages(): Promise<number> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact", "life-operator")
    .maybeSingle();

  if (!conversation?.id) return 0;

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("direction", "outbound")
    .is("read_at", null);

  if (error) {
    console.error(
      "[data/os/approvals] countUnreadLifeOperatorMessages",
      error,
    );
  }

  return count ?? 0;
}
