import "server-only";

import { listConversations } from "@/lib/data/comms/conversations";
import { listChannels } from "@/lib/data/comms/channels";
import { listAwaitingApprovalMessages } from "@/lib/data/comms/messages";
import { listApprovals } from "@/lib/data/os/approvals";
import { listWorkItems } from "@/lib/data/os/work-items";
import { listAllAgents } from "@/lib/data/os/agents";
import { listActivity } from "@/lib/data/os/activity";
import { getAutonomyState, type AutonomyMode } from "@/lib/workforce/autonomy";
import { buildHarmonyReflection, type HarmonyReflection } from "@/lib/harmony/reflection";
import type { ChannelKind } from "@/types/database";

/**
 * Harmony Oversight — the live operational snapshot.
 *
 * This is the read model behind the owner's supervision center. It ONLY reads
 * existing data layers (comms, approvals, work, agents, activity, autonomy,
 * reflection) and composes them — it owns no state of its own and never writes.
 * Everything here is grounded in real rows; nothing is fabricated.
 *
 * Two concepts in the spec have no first-class model yet (a schema addition is a
 * founder-gated migration): a numeric per-action "confidence" score and a
 * dedicated "escalation" record. Rather than invent either, we derive the
 * honest closest signal: escalations = the items genuinely demanding the owner
 * (high-risk pending approvals + blocked work), and "health" is a qualitative
 * tone computed from real backlog + reflection stats (the page renders the
 * underlying numbers, so the judgement is always transparent).
 */

export type OversightTone = "calm" | "steady" | "attention";

export interface OversightEscalation {
  id: string;
  source: "approval" | "work";
  title: string;
  detail: string;
}

export interface OversightAction {
  id: string;
  summary: string;
  kind: string;
  actor: string;
  at: string;
}

export interface OversightSnapshot {
  generatedAt: string;
  conversations: { active: number; pending: number; total: number };
  /** Outbound Harmony responses held for the owner's approval before sending. */
  pendingHarmonyResponses: number;
  channels: { connected: number; total: number; kinds: ChannelKind[] };
  approvals: { pending: number; highRisk: number };
  work: { inProgress: number; pending: number; blocked: number; delegations: number };
  workforce: { total: number; active: number; paused: number };
  automations: { mode: AutonomyMode; killSwitch: boolean; lockdown: boolean; active: boolean };
  escalations: OversightEscalation[];
  recentActions: OversightAction[];
  health: {
    hasData: boolean;
    tone: OversightTone;
    stats: HarmonyReflection["stats"] | null;
  };
}

export async function getOversightSnapshot(
  userId: string,
  companyId: string | null,
): Promise<OversightSnapshot> {
  const [conversations, channels, awaiting, pendingApprovals, workItems, agents, recent, autonomy] =
    await Promise.all([
      listConversations(),
      listChannels(),
      listAwaitingApprovalMessages(),
      listApprovals({ companyId: companyId ?? undefined, status: "pending" }),
      listWorkItems(companyId ? { companyId } : undefined),
      listAllAgents(),
      listActivity({ companyId: companyId ?? undefined, limit: 10 }),
      getAutonomyState(userId),
    ]);

  const activeConv = conversations.filter((c) => c.status === "open").length;
  const pendingConv = conversations.filter((c) => c.status === "pending").length;

  const connectedChannels = channels.filter((c) => c.status === "connected");
  const channelKinds = [...new Set(connectedChannels.map((c) => c.kind))];

  const highRiskApprovals = pendingApprovals.filter((a) => a.risk === "high");

  const inProgress = workItems.filter((w) => w.status === "in_progress");
  const blocked = workItems.filter((w) => w.status === "blocked");
  const pendingWork = workItems.filter((w) => w.status === "pending").length;
  // A delegation in progress = in-progress work that Harmony handed to a specialist.
  const delegations = inProgress.filter((w) => w.agent_id).length;

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const pausedAgents = agents.filter((a) => a.status === "paused").length;

  // Escalations: the closest REAL signal (no escalation table exists yet).
  const escalations: OversightEscalation[] = [
    ...highRiskApprovals.map((a) => ({
      id: a.id,
      source: "approval" as const,
      title: a.title,
      detail: a.summary ?? "",
    })),
    ...blocked.map((w) => ({
      id: w.id,
      source: "work" as const,
      title: w.title,
      detail: w.description ?? "",
    })),
  ];

  const recentActions: OversightAction[] = recent.map((e) => ({
    id: e.id,
    summary: e.summary,
    kind: e.kind,
    actor: e.actor_type,
    at: e.created_at,
  }));

  const automationsActive =
    !autonomy.global.kill_switch &&
    !autonomy.global.lockdown &&
    autonomy.global.mode !== "off";

  // Harmony health: a qualitative tone from real backlog + reflection. Never a
  // fabricated percentage — the page also renders the contributing numbers.
  let reflection: HarmonyReflection | null = null;
  if (companyId) {
    try {
      reflection = await buildHarmonyReflection(userId, companyId);
    } catch {
      reflection = null;
    }
  }

  const needsAttention =
    escalations.length > 0 || pendingApprovals.length > 0 || awaiting.length > 0;
  const tone: OversightTone = needsAttention
    ? "attention"
    : inProgress.length > 0 || activeConv > 0
      ? "steady"
      : "calm";

  return {
    generatedAt: new Date().toISOString(),
    conversations: { active: activeConv, pending: pendingConv, total: conversations.length },
    pendingHarmonyResponses: awaiting.length,
    channels: { connected: connectedChannels.length, total: channels.length, kinds: channelKinds },
    approvals: { pending: pendingApprovals.length, highRisk: highRiskApprovals.length },
    work: { inProgress: inProgress.length, pending: pendingWork, blocked: blocked.length, delegations },
    workforce: { total: agents.length, active: activeAgents, paused: pausedAgents },
    automations: {
      mode: autonomy.global.mode,
      killSwitch: autonomy.global.kill_switch,
      lockdown: autonomy.global.lockdown,
      active: automationsActive,
    },
    escalations,
    recentActions,
    health: {
      hasData: reflection?.hasData ?? false,
      tone,
      stats: reflection?.stats ?? null,
    },
  };
}
