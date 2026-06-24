import "server-only";

import { listObjectives } from "@/lib/workforce/objectives";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";

/**
 * Per-agent workload summary for the Workforce directory, profile, and graph.
 * One set of company-scoped queries, grouped by agent key. Read-only.
 */
export interface AgentSummary {
  currentObjective: { title: string; progress: number } | null;
  activeObjectives: number;
  queuedWork: number; // proposed or approved (not yet done/dismissed)
  openRecommendations: number;
}

export function emptyAgentSummary(): AgentSummary {
  return { currentObjective: null, activeObjectives: 0, queuedWork: 0, openRecommendations: 0 };
}

export async function getWorkforceSummary(
  userId: string,
  companyId: string | null,
): Promise<Record<string, AgentSummary>> {
  if (!userId) return {};
  const [objectives, work, recs] = await Promise.all([
    listObjectives(userId, { companyId, limit: 300 }),
    listWorkItems(userId, { companyId, limit: 300 }),
    listRecommendations(userId, { companyId, status: "open", limit: 300 }),
  ]);

  const out: Record<string, AgentSummary> = {};
  const ensure = (k: string): AgentSummary => (out[k] ??= emptyAgentSummary());

  // objectives are ordered newest-first; the first active one is "current".
  for (const o of objectives) {
    if (o.status !== "active") continue;
    const s = ensure(o.agent);
    s.activeObjectives += 1;
    if (!s.currentObjective) s.currentObjective = { title: o.title, progress: o.progress };
  }
  for (const w of work) {
    if (w.status === "proposed" || w.status === "approved") ensure(w.agent).queuedWork += 1;
  }
  for (const r of recs) ensure(r.agent).openRecommendations += 1;

  return out;
}
