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

export interface PendingApprovalUnified {
  id: string;
  company_id: string | null;
  status: "pending";
  source: "legacy" | "spine";
}

export interface ApprovalUnified {
  id: string;
  company_id: string | null;
  status: ApprovalStatus;
  source: "legacy" | "spine";
  title: string;
  summary: string | null;
  risk: "low" | "medium" | "high";
  type: string;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
  department_id: string | null;
  work_item_id: string | null;
  message_id: string | null;
  agent_message_id: string | null;
  original_agent?: string | null;
  original_action?: string | null;
  original_params?: Record<string, unknown> | null;
  required_context?: Record<string, unknown> | null;
  rejection_reason?: string | null;
}

/**
 * Canonical pending approvals contract used by both sidebar counts and
 * Approval Center rendering, so visible pending rows and counts remain
 * consistent across legacy + autonomy-spine stores.
 */
export async function listPendingApprovalsUnified(opts?: {
  companyId?: string;
}): Promise<PendingApprovalUnified[]> {
  const supabase = await createClient();

  let legacyQ = supabase
    .from("approvals")
    .select("id, company_id, status")
    .eq("status", "pending");
  let spineQ = supabase
    .from("approval_payloads")
    .select("id, company_id, status")
    .eq("status", "pending");

  if (opts?.companyId) {
    legacyQ = legacyQ.eq("company_id", opts.companyId);
    spineQ = spineQ.eq("company_id", opts.companyId);
  }

  const [legacy, spine] = await Promise.all([legacyQ, spineQ]);
  if (legacy.error) console.error("[data/os/approvals] listPendingApprovalsUnified(legacy)", legacy.error);
  if (spine.error) console.error("[data/os/approvals] listPendingApprovalsUnified(spine)", spine.error);

  const legacyRows = ((legacy.data as Array<{ id: string; company_id: string | null; status: "pending" }> | null) ?? []).map((row) => ({
    ...row,
    source: "legacy" as const,
  }));
  const spineRows = ((spine.data as Array<{ id: string; company_id: string | null; status: "pending" }> | null) ?? []).map((row) => ({
    ...row,
    source: "spine" as const,
  }));

  return [...legacyRows, ...spineRows];
}

/**
 * Unified Approval Center collection used for both pending + history rendering.
 * Includes legacy approvals and autonomy-spine approval payloads in a single
 * canonical row set so badge + page stay consistent.
 */
export async function listApprovalsUnified(opts?: {
  companyId?: string;
}): Promise<ApprovalUnified[]> {
  const supabase = await createClient();

  let legacyQ = supabase
    .from("approvals")
    .select(
      "id, company_id, status, title, summary, risk, type, created_at, decided_at, department_id, work_item_id, message_id, agent_message_id",
    );
  let spineQ = supabase
    .from("approval_payloads")
    .select(
      "id, approval_id, company_id, status, original_agent, original_action, original_params, required_context, rejection_reason, created_at, founder_approved_at, expires_at",
    );

  if (opts?.companyId) {
    legacyQ = legacyQ.eq("company_id", opts.companyId);
    spineQ = spineQ.eq("company_id", opts.companyId);
  }

  const [legacy, spine] = await Promise.all([legacyQ, spineQ]);

  if (legacy.error) {
    throw new Error(`[data/os/approvals] listApprovalsUnified(legacy): ${legacy.error.message}`);
  }
  if (spine.error) {
    throw new Error(`[data/os/approvals] listApprovalsUnified(spine): ${spine.error.message}`);
  }

  const legacyRows: ApprovalUnified[] =
    ((legacy.data as Array<{
      id: string;
      company_id: string | null;
      status: ApprovalStatus;
      title: string;
      summary: string | null;
      risk: "low" | "medium" | "high";
      type: string;
      created_at: string;
      decided_at: string | null;
      department_id: string | null;
      work_item_id: string | null;
      message_id: string | null;
      agent_message_id: string | null;
    }> | null) ?? []).map((row) => ({
      ...row,
      source: "legacy",
      expires_at: null,
      original_agent: null,
      original_action: null,
      original_params: null,
      required_context: null,
      rejection_reason: null,
    }));

  const spineRows: ApprovalUnified[] =
    ((spine.data as Array<{
      id: string;
      approval_id: string;
      company_id: string | null;
      status: ApprovalStatus;
      original_agent: string;
      original_action: string;
      original_params: Record<string, unknown> | null;
      required_context: Record<string, unknown> | null;
      rejection_reason: string | null;
      created_at: string;
      founder_approved_at: string | null;
      expires_at: string | null;
    }> | null) ?? []).map((row) => ({
      id: row.id,
      company_id: row.company_id,
      status: row.status,
      source: "spine",
      title: `${row.original_agent} · ${row.original_action}`,
      summary: `Approval payload: ${row.approval_id}`,
      risk: "medium",
      type: row.original_action,
      created_at: row.created_at,
      decided_at: row.founder_approved_at,
      expires_at: row.expires_at,
      department_id: null,
      work_item_id: null,
      message_id: null,
      agent_message_id: null,
      original_agent: row.original_agent,
      original_action: row.original_action,
      original_params: row.original_params,
      required_context: row.required_context,
      rejection_reason: row.rejection_reason,
    }));

  return [...legacyRows, ...spineRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
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
  const rows = await listPendingApprovalsUnified();
  return rows.length;
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
