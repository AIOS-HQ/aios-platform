import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { WorkItem, WorkStatus } from "@/types/database";

/** List work-queue items with optional company / department / project / status filters. */
export async function listWorkItems(opts?: {
  companyId?: string;
  departmentId?: string;
  projectId?: string;
  status?: WorkStatus;
}): Promise<WorkItem[]> {
  const supabase = await createClient();
  let q = supabase.from("work_items").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.departmentId) q = q.eq("department_id", opts.departmentId);
  if (opts?.projectId) q = q.eq("project_id", opts.projectId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) console.error("[data/os/work-items] listWorkItems", error);
  return (data as WorkItem[] | null) ?? [];
}

/** Count work items (owner-scoped via RLS). Used by the first-run checklist. */
export async function countWorkItems(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("work_items")
    .select("id", { count: "exact", head: true });
  if (error) console.error("[data/os/work-items] countWorkItems", error);
  return count ?? 0;
}
