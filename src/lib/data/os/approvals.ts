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

/** Count pending approvals (for the Command Center badge). */
export async function countPendingApprovals(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) console.error("[data/os/approvals] countPendingApprovals", error);
  return count ?? 0;
}
