import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  appendSkillContext,
  consultCompanySkills,
  recordSkillConsultation,
} from "@/lib/company-skills/utilization";
import { emitActivity } from "@/lib/harmony/os/events";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Agent recommendations — advisory suggestions surfaced for the founder to
 * accept or dismiss, in the spirit of the existing suggested-learnings flow.
 * Never acted on automatically. Owner-private + company-scoped (RLS).
 */

export type RecommendationStatus = "open" | "accepted" | "dismissed";

export interface AgentRecommendation {
  id: string;
  user_id: string;
  company_id: string | null;
  agent: string;
  title: string;
  detail: string | null;
  rationale: string | null;
  status: RecommendationStatus;
  created_at: string;
  updated_at: string;
}

export async function listRecommendations(
  userId: string,
  opts?: { companyId?: string | null; agent?: string; status?: RecommendationStatus; limit?: number },
): Promise<AgentRecommendation[]> {
  if (!userId) return [];
  const supabase = await createClient();
  let q = supabase.from("agent_recommendations").select("*").eq("user_id", userId);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.agent) q = q.eq("agent", opts.agent);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 100);
  const { data, error } = await q;
  if (error) {
    console.error("[workforce/recommendations] list", error.message);
    return [];
  }
  return (data as AgentRecommendation[] | null) ?? [];
}

export async function createRecommendation(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  title: string;
  detail?: string;
  rationale?: string;
}): Promise<AgentRecommendation | null> {
  const title = params.title.trim();
  if (!title) return null;
  const def = getAiosAgent(params.agent);
  if (!def) {
    console.error("[workforce/recommendations] unknown agent", params.agent);
    return null;
  }
  const consultation = await consultCompanySkills({
    userId: params.userId,
    companyId: params.companyId,
    agent: params.agent,
    purpose: "recommendation",
    query: `${title}\n${params.detail ?? ""}\n${params.rationale ?? ""}`,
    emit: false,
  });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_recommendations")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      agent: params.agent,
      title: title.slice(0, 300),
      detail: params.detail?.slice(0, 4000) ?? null,
      rationale: appendSkillContext(params.rationale, consultation)?.slice(0, 4000) ?? null,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[workforce/recommendations] create", error.message);
    return null;
  }
  const rec = data as AgentRecommendation | null;
  if (rec) {
    await emitActivity({
      userId: params.userId,
      companyId: params.companyId,
      actorType: "agent",
      kind: "agent_action",
      summary: `${def.name} recommended: ${title}`,
      refType: "agent_recommendation",
      refId: rec.id,
    });
    if (consultation.skills.length > 0) {
      await recordSkillConsultation({
        userId: params.userId,
        companyId: params.companyId,
        agent: params.agent,
        consultation,
        sourceType: "agent_recommendation",
        sourceId: rec.id,
      });
    }
  }
  return rec;
}

export async function setRecommendationStatus(
  userId: string,
  id: string,
  status: RecommendationStatus,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_recommendations")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[workforce/recommendations] setStatus", error.message);
    return false;
  }
  return true;
}
