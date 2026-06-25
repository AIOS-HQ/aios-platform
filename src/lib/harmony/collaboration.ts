"use server";

import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Harmony Live Orchestration — REAL collaboration events only.
 *
 * Surfaces genuine agent-to-agent activity (from the A2A substrate) so Harmony
 * can narrate the work her specialists are actually doing. Nothing is
 * fabricated: every item is a real `agent_messages` row, company-scoped. Returns
 * [] when there's no company or no activity, so the UI simply hides.
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

export async function loadHarmonyActivity(): Promise<HarmonyActivityItem[]> {
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return [];

  const messages = await listAgentMessages(user.id, companyId, { limit: 8 });
  return messages.map((m) => {
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
}
