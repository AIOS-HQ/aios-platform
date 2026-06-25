"use server";

import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Harmony Live Orchestration — REAL collaboration events only.
 *
 * Surfaces genuine specialist activity so Harmony can narrate the work her team
 * is actually doing. Two real sources, reused (never fabricated):
 *   - A2A substrate (`agent_messages`) — delegations, responses, outcomes.
 *   - Work Queue (`agent_work_queue`) — active/blocked/just-completed work.
 * Everything is company-scoped; returns [] when there's no company or activity
 * so the UI hides.
 */
export interface HarmonyActivityItem {
  id: string;
  agentKey: string;
  agentName: string;
  status: string;
  kind: string;
  subject: string;
  at: string;
}

/** Work Queue statuses worth surfacing as live collaboration. */
const ACTIVE_WORK = ["in_progress", "blocked", "approved", "done"];

export async function loadHarmonyActivity(): Promise<HarmonyActivityItem[]> {
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return [];

  const [messages, work] = await Promise.all([
    listAgentMessages(user.id, companyId, { limit: 8 }),
    listWorkItems(user.id, { companyId, limit: 30 }),
  ]);

  const fromA2A: HarmonyActivityItem[] = messages.map((m) => {
    // The acting specialist is the responder on a response, else the delegatee.
    const actingKey = m.kind === "response" ? m.from_agent : m.to_agent;
    return {
      id: m.id,
      agentKey: actingKey,
      agentName: getAiosAgent(actingKey)?.name ?? actingKey,
      status: m.status,
      kind: m.kind,
      subject: m.subject.replace(/^Re:\s*/, "").slice(0, 120),
      at: m.created_at,
    };
  });

  const fromWork: HarmonyActivityItem[] = work
    .filter((w) => ACTIVE_WORK.includes(w.status))
    .map((w) => ({
      id: `work-${w.id}`,
      agentKey: w.agent,
      agentName: getAiosAgent(w.agent)?.name ?? w.agent,
      // Normalize to the strip's vocabulary (done reads as "completed").
      status: w.status === "done" ? "completed" : w.status,
      kind: "work",
      subject: (w.title ?? "").slice(0, 120),
      at: w.created_at,
    }));

  return [...fromA2A, ...fromWork]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);
}
