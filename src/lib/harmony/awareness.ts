import "server-only";

import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { listObjectives } from "@/lib/workforce/objectives";
import { listAutonomyAudit, getAutonomyState } from "@/lib/workforce/autonomy";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { listTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";

/**
 * Executive Awareness — what Harmony proactively knows when you open her. This
 * REUSES the existing systems (Work Queue, Recommendations, Objectives, Autonomy
 * audit, A2A approvals, plus personal tasks/goals); it does not duplicate any of
 * them. Company-scoped; personal-only users simply get the tasks/goals view.
 */
export interface HarmonyAwareness {
  hasCompany: boolean;
  /** Org signals (only meaningful when hasCompany). */
  completedToday: number;
  blockedWork: number;
  waitingApprovals: number;
  opportunities: number;
  priorities: number;
  autonomyMode: string;
  alert: boolean;
  /** Personal signals (always). */
  openTasks: number;
  activeGoals: number;
}

const AUTO_DECISIONS = ["auto_executed", "notified"];

export async function getHarmonyAwareness(userId: string): Promise<HarmonyAwareness> {
  const companyId = await resolvePrimaryCompanyId();

  const [tasks, goals] = await Promise.all([listTasks(), listGoals()]);
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const activeGoals = goals.filter((g) => g.status === "active").length;

  if (!companyId) {
    return {
      hasCompany: false,
      completedToday: 0,
      blockedWork: 0,
      waitingApprovals: 0,
      opportunities: 0,
      priorities: 0,
      autonomyMode: "off",
      alert: false,
      openTasks,
      activeGoals,
    };
  }

  const [audit, work, recs, objectives, messages, autonomy] = await Promise.all([
    listAutonomyAudit(userId, 300),
    listWorkItems(userId, { companyId, limit: 300 }),
    listRecommendations(userId, { companyId, status: "open", limit: 200 }),
    listObjectives(userId, { companyId, status: "proposed", limit: 200 }),
    listAgentMessages(userId, companyId, { limit: 200 }),
    getAutonomyState(userId),
  ]);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const completedToday = audit.filter(
    (a) =>
      new Date(a.created_at).getTime() >= todayStart.getTime() &&
      AUTO_DECISIONS.includes(a.decision),
  ).length;
  const blockedWork = work.filter((w) => w.status === "blocked").length;
  const waitingApprovals = messages.filter(
    (m) => m.status === "awaiting_approval",
  ).length;

  return {
    hasCompany: true,
    completedToday,
    blockedWork,
    waitingApprovals,
    opportunities: recs.length,
    priorities: objectives.length,
    autonomyMode: autonomy.global.mode,
    alert:
      autonomy.global.kill_switch || autonomy.global.lockdown || blockedWork > 0,
    openTasks,
    activeGoals,
  };
}
