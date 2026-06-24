import "server-only";

import { createClient } from "@/lib/supabase/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Agent work queue — proposed units of work for AIOS workforce members.
 *
 * Behaviour-neutral by default: items are created `status='proposed'`,
 * `autonomy='advisory'`, `requires_approval=true`. Nothing here executes work;
 * promotion/approval and (future, gated) autonomous execution are layered on
 * top. `risk` mirrors the A2A vocabulary so risky items route through the
 * Approval Center exactly as agent_messages do. Owner-private + company-scoped.
 */

export type WorkStatus = "proposed" | "approved" | "in_progress" | "done" | "blocked" | "dismissed";
export type WorkKind = "task" | "message" | "review";
export type WorkRisk = "routine" | "approval" | "destructive";
export type AutonomyMode = "advisory" | "auto";

export interface WorkItem {
  id: string;
  user_id: string;
  company_id: string | null;
  agent: string;
  objective_id: string | null;
  title: string;
  detail: string | null;
  kind: WorkKind;
  risk: WorkRisk;
  status: WorkStatus;
  autonomy: AutonomyMode;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
}

export async function listWorkItems(
  userId: string,
  opts?: { companyId?: string | null; agent?: string; status?: WorkStatus; limit?: number },
): Promise<WorkItem[]> {
  if (!userId) return [];
  const supabase = await createClient();
  let q = supabase.from("agent_work_queue").select("*").eq("user_id", userId);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.agent) q = q.eq("agent", opts.agent);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) {
    console.error("[workforce/work-queue] list", error.message);
    return [];
  }
  return (data as WorkItem[] | null) ?? [];
}

export async function createWorkItem(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  title: string;
  detail?: string;
  kind?: WorkKind;
  risk?: WorkRisk;
  objectiveId?: string | null;
}): Promise<WorkItem | null> {
  const title = params.title.trim();
  if (!title) return null;
  const def = getAiosAgent(params.agent);
  if (!def) {
    console.error("[workforce/work-queue] unknown agent", params.agent);
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_work_queue")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      agent: params.agent,
      objective_id: params.objectiveId ?? null,
      title: title.slice(0, 300),
      detail: params.detail?.slice(0, 8000) ?? null,
      kind: params.kind ?? "task",
      risk: params.risk ?? "routine",
      // status/autonomy/requires_approval use the advisory-default DB columns.
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[workforce/work-queue] create", error.message);
    return null;
  }
  const item = data as WorkItem | null;
  if (item) {
    await emitActivity({
      userId: params.userId,
      companyId: params.companyId,
      actorType: "agent",
      kind: "agent_action",
      summary: `Work queued for ${def.name}: ${title}`,
      refType: "agent_work_item",
      refId: item.id,
    });
  }
  return item;
}

export async function setWorkItemStatus(
  userId: string,
  id: string,
  status: WorkStatus,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_work_queue")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[workforce/work-queue] setStatus", error.message);
    return false;
  }
  return true;
}
