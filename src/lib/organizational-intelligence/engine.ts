import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAiosAgent } from "@/lib/workforce/registry";
import type { AgentMessage } from "@/lib/harmony/agents/a2a";
import type { WorkItem as AgentWorkItem } from "@/lib/workforce/work-queue";
import type { AgentObjective } from "@/lib/workforce/objectives";
import type { ActivityEvent, Approval, WorkItem } from "@/types/database";

export type OieSignalKind =
  | "collaboration"
  | "execution_pattern"
  | "bottleneck"
  | "workload"
  | "objective";

export interface WorkforceCollaborationPattern {
  id: string;
  agents: string[];
  label: string;
  total: number;
  completed: number;
  blocked: number;
  approvals: number;
  reliability: number;
  averageDurationHours: number | null;
  lastSeen: string;
}

export interface OrganizationalBottleneck {
  id: string;
  title: string;
  count: number;
  severity: "high" | "medium" | "low";
  agents: string[];
  recommendation: string;
}

export interface OrganizationalExecutionPattern {
  id: string;
  title: string;
  detail: string;
  confidence: number;
  agents: string[];
}

export interface WorkforceMemberTrend {
  agent: string;
  completed: number;
  blocked: number;
  active: number;
  reliability: number;
  averageDurationHours: number | null;
}

export interface OrganizationalIntelligence {
  generatedAt: string;
  windowDays: number;
  metrics: {
    collaborations: number;
    completedExecutions: number;
    blockedExecutions: number;
    approvalFrequency: number;
    averageCompletionHours: number | null;
    objectiveCompletionRate: number;
    activitySignals: number;
  };
  strongestCollaboration: WorkforceCollaborationPattern | null;
  highestPerformingCollaboration: WorkforceCollaborationPattern | null;
  mostEffectivePattern: OrganizationalExecutionPattern | null;
  fastestImprovingMember: WorkforceMemberTrend | null;
  bottlenecks: OrganizationalBottleneck[];
  collaborations: WorkforceCollaborationPattern[];
  workforce: WorkforceMemberTrend[];
  planningContext: string;
}

interface OieInput {
  messages: AgentMessage[];
  agentWork: AgentWorkItem[];
  osWork: WorkItem[];
  objectives: AgentObjective[];
  approvals: Approval[];
  activity: ActivityEvent[];
  windowDays?: number;
}

const ACTIVE_AGENT_WORK = new Set(["proposed", "approved", "in_progress"]);
const COMPLETED_AGENT_WORK = new Set(["done"]);
const BLOCKED_AGENT_WORK = new Set(["blocked"]);
const ACTIVE_OS_WORK = new Set(["pending", "in_progress", "awaiting_approval"]);
const COMPLETED_OS_WORK = new Set(["completed"]);
const BLOCKED_OS_WORK = new Set(["blocked"]);

function hoursBetween(start: string, end: string): number {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function agentName(agent: string): string {
  return getAiosAgent(agent)?.name ?? agent;
}

function comboId(agents: string[]): string {
  return [...new Set(agents)].sort().join("+");
}

function collaborationLabel(agents: string[]): string {
  return agents.map(agentName).join(" + ");
}

function objectiveType(title: string, detail?: string | null): string {
  const text = `${title} ${detail ?? ""}`.toLowerCase();
  if (/security|risk|approval|policy|credential|token/.test(text)) return "governance";
  if (/content|campaign|publish|seo|social|growth/.test(text)) return "growth";
  if (/deploy|connector|health|monitor|ops|incident|recovery/.test(text)) return "operations";
  if (/test|qa|bug|regression|lint|quality/.test(text)) return "quality";
  if (/plan|strategy|roadmap|priority|objective/.test(text)) return "planning";
  return "execution";
}

function addTrend(
  trends: Map<string, WorkforceMemberTrend>,
  agent: string,
  status: "completed" | "blocked" | "active",
  durationHours?: number | null,
) {
  const trend = trends.get(agent) ?? {
    agent,
    completed: 0,
    blocked: 0,
    active: 0,
    reliability: 0,
    averageDurationHours: null,
  };
  if (status === "completed") trend.completed += 1;
  if (status === "blocked") trend.blocked += 1;
  if (status === "active") trend.active += 1;
  const durations = [
    ...(trend.averageDurationHours == null ? [] : [trend.averageDurationHours]),
    ...(durationHours == null ? [] : [durationHours]),
  ];
  trend.averageDurationHours = average(durations);
  trend.reliability = percent(trend.completed, trend.completed + trend.blocked);
  trends.set(agent, trend);
}

function bottleneckSeverity(count: number): OrganizationalBottleneck["severity"] {
  if (count >= 5) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function buildOrganizationalIntelligenceFromData(input: OieInput): OrganizationalIntelligence {
  const collaborationMap = new Map<string, WorkforceCollaborationPattern>();
  const trends = new Map<string, WorkforceMemberTrend>();
  const bottleneckCounts = new Map<string, { count: number; agents: Set<string> }>();
  const objectiveTypes = new Map<string, { total: number; completed: number }>();
  const durations: number[] = [];

  for (const message of input.messages) {
    const agents = [message.from_agent, message.to_agent].filter(Boolean);
    const id = comboId(agents);
    if (!id) continue;
    const duration =
      message.status === "completed" || message.status === "blocked"
        ? hoursBetween(message.created_at, message.updated_at)
        : null;
    if (duration != null && message.status === "completed") durations.push(duration);
    const prior = collaborationMap.get(id) ?? {
      id,
      agents: [...new Set(agents)].sort(),
      label: collaborationLabel([...new Set(agents)].sort()),
      total: 0,
      completed: 0,
      blocked: 0,
      approvals: 0,
      reliability: 0,
      averageDurationHours: null,
      lastSeen: message.created_at,
    };
    prior.total += 1;
    if (message.status === "completed") prior.completed += 1;
    if (message.status === "blocked") prior.blocked += 1;
    if (message.status === "awaiting_approval") prior.approvals += 1;
    prior.reliability = percent(prior.completed, prior.completed + prior.blocked);
    prior.averageDurationHours = average([
      ...(prior.averageDurationHours == null ? [] : [prior.averageDurationHours]),
      ...(duration == null ? [] : [duration]),
    ]);
    if (message.created_at > prior.lastSeen) prior.lastSeen = message.created_at;
    collaborationMap.set(id, prior);

    const acting = message.kind === "response" ? message.from_agent : message.to_agent;
    if (message.status === "completed") addTrend(trends, acting, "completed", duration);
    else if (message.status === "blocked") addTrend(trends, acting, "blocked", duration);
    else addTrend(trends, acting, "active", null);

    if (message.status === "blocked") {
      const key = objectiveType(message.subject, message.body);
      const item = bottleneckCounts.get(key) ?? { count: 0, agents: new Set<string>() };
      item.count += 1;
      for (const agent of agents) item.agents.add(agent);
      bottleneckCounts.set(key, item);
    }
  }

  for (const work of input.agentWork) {
    const duration =
      COMPLETED_AGENT_WORK.has(work.status) || BLOCKED_AGENT_WORK.has(work.status)
        ? hoursBetween(work.created_at, work.updated_at)
        : null;
    if (COMPLETED_AGENT_WORK.has(work.status)) {
      durations.push(...(duration == null ? [] : [duration]));
      addTrend(trends, work.agent, "completed", duration);
    } else if (BLOCKED_AGENT_WORK.has(work.status)) {
      addTrend(trends, work.agent, "blocked", duration);
      const key = objectiveType(work.title, work.detail);
      const item = bottleneckCounts.get(key) ?? { count: 0, agents: new Set<string>() };
      item.count += 1;
      item.agents.add(work.agent);
      bottleneckCounts.set(key, item);
    } else if (ACTIVE_AGENT_WORK.has(work.status)) {
      addTrend(trends, work.agent, "active", null);
    }
  }

  for (const work of input.osWork) {
    const owner = work.agent_id ?? work.department_id ?? "harmony";
    const duration =
      COMPLETED_OS_WORK.has(work.status) || BLOCKED_OS_WORK.has(work.status)
        ? hoursBetween(work.created_at, work.updated_at)
        : null;
    if (COMPLETED_OS_WORK.has(work.status)) {
      durations.push(...(duration == null ? [] : [duration]));
      addTrend(trends, owner, "completed", duration);
    } else if (BLOCKED_OS_WORK.has(work.status)) {
      addTrend(trends, owner, "blocked", duration);
      const key = objectiveType(work.title, work.description);
      const item = bottleneckCounts.get(key) ?? { count: 0, agents: new Set<string>() };
      item.count += 1;
      item.agents.add(owner);
      bottleneckCounts.set(key, item);
    } else if (ACTIVE_OS_WORK.has(work.status)) {
      addTrend(trends, owner, "active", null);
    }
  }

  for (const objective of input.objectives) {
    const type = objectiveType(objective.title, objective.detail);
    const stats = objectiveTypes.get(type) ?? { total: 0, completed: 0 };
    stats.total += 1;
    if (objective.status === "done") stats.completed += 1;
    objectiveTypes.set(type, stats);
  }

  const completedExecutions =
    input.messages.filter((m) => m.status === "completed").length +
    input.agentWork.filter((w) => COMPLETED_AGENT_WORK.has(w.status)).length +
    input.osWork.filter((w) => COMPLETED_OS_WORK.has(w.status)).length;
  const blockedExecutions =
    input.messages.filter((m) => m.status === "blocked").length +
    input.agentWork.filter((w) => BLOCKED_AGENT_WORK.has(w.status)).length +
    input.osWork.filter((w) => BLOCKED_OS_WORK.has(w.status)).length;
  const approvalFrequency = percent(
    input.approvals.length + input.messages.filter((m) => m.status === "awaiting_approval").length,
    completedExecutions + blockedExecutions + input.approvals.length,
  );

  const collaborations = [...collaborationMap.values()].sort(
    (a, b) => b.reliability - a.reliability || b.completed - a.completed || b.total - a.total,
  );
  const workforce = [...trends.values()].sort(
    (a, b) => b.reliability - a.reliability || b.completed - a.completed,
  );
  const fastestImprovingMember =
    workforce.filter((w) => w.completed > 0).sort((a, b) => b.completed - a.completed || a.blocked - b.blocked)[0] ??
    null;
  const bottlenecks = [...bottleneckCounts.entries()]
    .map(([id, value]) => ({
      id,
      title: `${id} bottleneck`,
      count: value.count,
      severity: bottleneckSeverity(value.count),
      agents: [...value.agents].sort(),
      recommendation: `Plan ${id} work with explicit owner, approval path, and recovery step before execution.`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const strongestCollaboration = collaborations[0] ?? null;
  const highestPerformingCollaboration =
    collaborations.filter((c) => c.completed > 0).sort((a, b) => b.completed - a.completed || b.reliability - a.reliability)[0] ??
    null;
  const strongestObjectiveType = [...objectiveTypes.entries()].sort(
    (a, b) => percent(b[1].completed, b[1].total) - percent(a[1].completed, a[1].total) || b[1].total - a[1].total,
  )[0];
  const mostEffectivePattern: OrganizationalExecutionPattern | null = strongestObjectiveType
    ? {
        id: strongestObjectiveType[0],
        title: `${strongestObjectiveType[0]} execution pattern`,
        detail: `${percent(strongestObjectiveType[1].completed, strongestObjectiveType[1].total)}% objective completion across ${strongestObjectiveType[1].total} objective(s).`,
        confidence: percent(strongestObjectiveType[1].completed, strongestObjectiveType[1].total),
        agents: strongestCollaboration?.agents ?? [],
      }
    : null;
  const objectiveTotal = [...objectiveTypes.values()].reduce((sum, stat) => sum + stat.total, 0);
  const objectiveCompleted = [...objectiveTypes.values()].reduce((sum, stat) => sum + stat.completed, 0);

  const planningContext = [
    strongestCollaboration
      ? `Strongest collaboration: ${strongestCollaboration.label} (${strongestCollaboration.reliability}% reliability, ${strongestCollaboration.completed} completed).`
      : "No stable workforce collaboration pattern yet.",
    mostEffectivePattern
      ? `Most effective pattern: ${mostEffectivePattern.title}; ${mostEffectivePattern.detail}`
      : "No objective success pattern has enough history yet.",
    bottlenecks[0]
      ? `Recurring bottleneck: ${bottlenecks[0].title} across ${bottlenecks[0].count} event(s); ${bottlenecks[0].recommendation}`
      : "No recurring bottleneck detected.",
  ].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    windowDays: input.windowDays ?? 30,
    metrics: {
      collaborations: collaborations.length,
      completedExecutions,
      blockedExecutions,
      approvalFrequency,
      averageCompletionHours: average(durations),
      objectiveCompletionRate: percent(objectiveCompleted, objectiveTotal),
      activitySignals: input.activity.length,
    },
    strongestCollaboration,
    highestPerformingCollaboration,
    mostEffectivePattern,
    fastestImprovingMember,
    bottlenecks,
    collaborations: collaborations.slice(0, 8),
    workforce,
    planningContext,
  };
}

export function formatOrganizationalContext(intelligence: OrganizationalIntelligence): string {
  if (
    intelligence.metrics.collaborations === 0 &&
    intelligence.metrics.completedExecutions === 0 &&
    intelligence.metrics.blockedExecutions === 0 &&
    intelligence.bottlenecks.length === 0
  ) {
    return "";
  }
  return intelligence.planningContext;
}

export function appendOrganizationalContext(
  text: string | null | undefined,
  intelligence: OrganizationalIntelligence,
): string | null {
  const context = formatOrganizationalContext(intelligence);
  if (!context.trim()) return text ?? null;
  return `${text?.trim() ? `${text.trim()}\n\n` : ""}Organizational Intelligence considered:\n${context}`;
}

export async function buildOrganizationalIntelligence(
  userId: string,
  companyId: string | null,
  opts?: { limit?: number; windowDays?: number },
): Promise<OrganizationalIntelligence> {
  const limit = opts?.limit ?? 400;
  if (!companyId) {
    return buildOrganizationalIntelligenceFromData({
      messages: [],
      agentWork: [],
      osWork: [],
      objectives: [],
      approvals: [],
      activity: [],
      windowDays: opts?.windowDays,
    });
  }

  const supabase = await createClient();
  const [messages, agentWork, osWork, objectives, approvals, activity] = await Promise.all([
    supabase
      .from("agent_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("agent_work_queue")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("work_items")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("agent_objectives")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("approvals")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("activity_events")
      .select("*")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  for (const [name, result] of [
    ["agent_messages", messages],
    ["agent_work_queue", agentWork],
    ["work_items", osWork],
    ["agent_objectives", objectives],
    ["approvals", approvals],
    ["activity_events", activity],
  ] as const) {
    if (result.error) console.error(`[organizational-intelligence] ${name}`, result.error.message);
  }

  return buildOrganizationalIntelligenceFromData({
    messages: (messages.data as AgentMessage[] | null) ?? [],
    agentWork: (agentWork.data as AgentWorkItem[] | null) ?? [],
    osWork: (osWork.data as WorkItem[] | null) ?? [],
    objectives: (objectives.data as AgentObjective[] | null) ?? [],
    approvals: (approvals.data as Approval[] | null) ?? [],
    activity: (activity.data as ActivityEvent[] | null) ?? [],
    windowDays: opts?.windowDays,
  });
}
