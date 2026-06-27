import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  appendSkillContext,
  consultCompanySkills,
  recordSkillConsultation,
} from "@/lib/company-skills/utilization";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  appendOrganizationalContext,
  buildOrganizationalIntelligence,
} from "@/lib/organizational-intelligence/engine";
import {
  appendAdaptivePlan,
  buildAdaptiveExecutionPlan,
} from "@/lib/harmony/adaptive-planning";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Agent objectives — what each AIOS workforce member is working toward.
 *
 * `origin` records who set it: the founder, or the agent (agent-proposed
 * objectives start as 'proposed' and the founder promotes them to 'active').
 * Owner-private + company-scoped (RLS). Pure data access; no autonomous
 * execution. Degrades gracefully if the table is unavailable.
 */

export type ObjectiveStatus = "proposed" | "active" | "paused" | "done" | "dismissed";
export type ObjectivePriority = "low" | "medium" | "high";
export type ObjectiveOrigin = "agent" | "founder";

export interface AgentObjective {
  id: string;
  user_id: string;
  company_id: string | null;
  agent: string;
  title: string;
  detail: string | null;
  status: ObjectiveStatus;
  priority: ObjectivePriority;
  origin: ObjectiveOrigin;
  progress: number;
  created_at: string;
  updated_at: string;
}

export async function listObjectives(
  userId: string,
  opts?: { companyId?: string | null; agent?: string; status?: ObjectiveStatus; limit?: number },
): Promise<AgentObjective[]> {
  if (!userId) return [];
  const supabase = await createClient();
  let q = supabase.from("agent_objectives").select("*").eq("user_id", userId);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.agent) q = q.eq("agent", opts.agent);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) {
    console.error("[workforce/objectives] list", error.message);
    return [];
  }
  return (data as AgentObjective[] | null) ?? [];
}

export async function createObjective(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  title: string;
  detail?: string;
  priority?: ObjectivePriority;
  origin?: ObjectiveOrigin;
}): Promise<AgentObjective | null> {
  const title = params.title.trim();
  if (!title) return null;
  const def = getAiosAgent(params.agent);
  if (!def) {
    console.error("[workforce/objectives] unknown agent", params.agent);
    return null;
  }
  const origin: ObjectiveOrigin = params.origin ?? "founder";
  const consultation = await consultCompanySkills({
    userId: params.userId,
    companyId: params.companyId,
    agent: params.agent,
    purpose: "objective_planning",
    query: `${title}\n${params.detail ?? ""}`,
    emit: false,
  });
  const organization = await buildOrganizationalIntelligence(params.userId, params.companyId, {
    limit: 300,
  });
  const supabase = await createClient();
  const plannedDetail = appendOrganizationalContext(
    appendSkillContext(params.detail, consultation),
    organization,
  );
  const adaptivePlan = await buildAdaptiveExecutionPlan({
    userId: params.userId,
    companyId: params.companyId,
    title,
    detail: params.detail,
    agent: params.agent,
    skills: consultation.skills,
    organization,
  });
  const { data, error } = await supabase
    .from("agent_objectives")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      agent: params.agent,
      title: title.slice(0, 300),
      detail: (adaptivePlan ? appendAdaptivePlan(plannedDetail, adaptivePlan) : plannedDetail)?.slice(0, 4000) ?? null,
      priority: params.priority ?? "medium",
      origin,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[workforce/objectives] create", error.message);
    return null;
  }
  const objective = data as AgentObjective | null;
  if (objective) {
    await emitActivity({
      userId: params.userId,
      companyId: params.companyId,
      actorType: origin === "agent" ? "agent" : "founder",
      kind: "agent_action",
      summary: `Objective ${origin === "agent" ? "proposed" : "set"} for ${def.name}: ${title}`,
      refType: "agent_objective",
      refId: objective.id,
    });
    if (consultation.skills.length > 0) {
      await recordSkillConsultation({
        userId: params.userId,
        companyId: params.companyId,
        agent: params.agent,
        consultation,
        sourceType: "agent_objective",
        sourceId: objective.id,
      });
    }
  }
  return objective;
}

export async function setObjectiveStatus(
  userId: string,
  id: string,
  status: ObjectiveStatus,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_objectives")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[workforce/objectives] setStatus", error.message);
    return false;
  }

  // Event-driven executive reflection: a completed objective is a meaningful
  // execution event. Best-effort and fail-open (never blocks the status
  // update); lazily imported to avoid an import cycle (the reflection engine
  // reads objectives).
  if (status === "done") {
    try {
      const [{ resolvePrimaryCompanyId }, { reflectAfterEvent }] = await Promise.all([
        import("@/lib/julius/wiring"),
        import("@/lib/harmony/reflection"),
      ]);
      const companyId = await resolvePrimaryCompanyId();
      if (companyId) {
        await reflectAfterEvent(userId, companyId, "objective_completed");
      }
    } catch (e) {
      console.error("[workforce/objectives] reflectAfterEvent", e);
    }
  }

  return true;
}

export async function setObjectiveProgress(
  userId: string,
  id: string,
  progress: number,
): Promise<boolean> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_objectives")
    .update({ progress: clamped })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[workforce/objectives] setProgress", error.message);
    return false;
  }
  return true;
}
