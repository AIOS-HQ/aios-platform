/**
 * AI Workforce Organization View — the operable org model.
 *
 * Pure + dependency-light (registry + the static relationships model). Takes the
 * per-agent workload summary and the A2A message log as INPUTS (no I/O), so it
 * composes an org chart (reporting lines), capacity + utilization, active tasks,
 * AI health, communication flow, and a recent timeline — and is fully unit
 * testable. The server page supplies the live data; this decides the shape.
 *
 * Founder-only Mason is excluded (never subscriber-facing); the founder is the
 * root of the reporting tree. Distinct from the static relationship map
 * (relationships.ts) — this is the live operational picture.
 */

import { AIOS_WORKFORCE, isFounderOnlyAgent } from "@/lib/workforce/registry";
import { WORKER_RELATIONSHIPS, FOUNDER_NODE } from "@/lib/workforce/relationships";

/** Structural shape of a per-agent workload summary (see workforce/summary). */
export interface AgentSummaryLike {
  currentObjective: { title: string; progress: number } | null;
  activeObjectives: number;
  queuedWork: number;
  openRecommendations: number;
}

/** Structural shape of the A2A message fields the org view consumes. */
export interface OrgMessageInput {
  from_agent: string;
  to_agent: string;
  status: string;
  risk: string;
  subject: string;
  created_at: string;
}

export type WorkerHealth = "healthy" | "busy" | "overloaded" | "attention" | "idle";

/** In-flight A2A statuses that count as active work on the recipient. */
const ACTIVE_STATUSES = new Set(["open", "delegated", "in_progress", "awaiting_approval"]);
const DEFAULT_CAPACITY = 5;

export interface CapacitySnapshot {
  load: number;
  capacity: number;
  utilizationPct: number;
  status: WorkerHealth;
}

export interface OrgWorker {
  key: string;
  name: string;
  role: string;
  reportsTo: string | null;
  health: WorkerHealth;
  capacity: CapacitySnapshot;
  activeTasks: number;
  pendingApprovals: number;
  blocked: number;
  sent: number;
  received: number;
  openRecommendations: number;
  currentObjective: { title: string; progress: number } | null;
}

export interface CommEdge {
  from: string;
  to: string;
  count: number;
  approvals: number;
}

export interface TimelineEvent {
  at: string;
  from: string;
  to: string;
  subject: string;
  status: string;
}

export interface OrgTotals {
  workers: number;
  activeTasks: number;
  pendingApprovals: number;
  blocked: number;
  overloaded: number;
}

export interface OrganizationView {
  founderKey: string;
  workers: OrgWorker[];
  commEdges: CommEdge[];
  timeline: TimelineEvent[];
  totals: OrgTotals;
}

export interface OrgViewInput {
  summary: Record<string, AgentSummaryLike>;
  messages: OrgMessageInput[];
  now?: number;
  nominalCapacity?: number;
  timelineLimit?: number;
}

function healthFor(load: number, utilizationPct: number, blocked: number, pendingApprovals: number): WorkerHealth {
  if (blocked > 0) return "attention";
  if (utilizationPct > 100) return "overloaded";
  if (pendingApprovals > 0 || utilizationPct > 60) return "busy";
  if (load > 0) return "healthy";
  return "idle";
}

/** Build the live organization view. Pure — no I/O. */
export function buildOrganizationView(input: OrgViewInput): OrganizationView {
  const capacity = input.nominalCapacity ?? DEFAULT_CAPACITY;
  const timelineLimit = input.timelineLimit ?? 12;
  const workerAgents = AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key));
  const validKeys = new Set<string>(workerAgents.map((a) => a.key));
  // Only messages between subscriber-facing workers count — founder-only agents
  // (Mason) are excluded from the org entirely, so their traffic never inflates
  // a worker's load, the comm graph, or the timeline.
  const relevant = input.messages.filter(
    (m) => validKeys.has(m.from_agent) && validKeys.has(m.to_agent),
  );

  const workers: OrgWorker[] = workerAgents.map((agent) => {
    const s = input.summary[agent.key] ?? {
      currentObjective: null,
      activeObjectives: 0,
      queuedWork: 0,
      openRecommendations: 0,
    };
    let sent = 0;
    let received = 0;
    let inFlight = 0;
    let pendingApprovals = 0;
    let blocked = 0;
    for (const m of relevant) {
      if (m.from_agent === agent.key) sent += 1;
      if (m.to_agent === agent.key) {
        received += 1;
        if (ACTIVE_STATUSES.has(m.status)) inFlight += 1;
        if (m.status === "awaiting_approval") pendingApprovals += 1;
        if (m.status === "blocked") blocked += 1;
      }
    }
    const load = s.activeObjectives + s.queuedWork + inFlight;
    const utilizationPct = Math.round((load / capacity) * 100);
    const status = healthFor(load, utilizationPct, blocked, pendingApprovals);
    return {
      key: agent.key,
      name: agent.name,
      role: agent.role,
      reportsTo: WORKER_RELATIONSHIPS[agent.key]?.reportsTo ?? FOUNDER_NODE,
      health: status,
      capacity: { load, capacity, utilizationPct, status },
      activeTasks: inFlight,
      pendingApprovals,
      blocked,
      sent,
      received,
      openRecommendations: s.openRecommendations,
      currentObjective: s.currentObjective,
    };
  });

  // Communication flow: aggregate worker→worker messages.
  const edgeMap = new Map<string, CommEdge>();
  for (const m of relevant) {
    if (m.from_agent === m.to_agent) continue;
    const k = `${m.from_agent}>${m.to_agent}`;
    const e = edgeMap.get(k) ?? { from: m.from_agent, to: m.to_agent, count: 0, approvals: 0 };
    e.count += 1;
    if (m.risk !== "routine" || m.status === "awaiting_approval") e.approvals += 1;
    edgeMap.set(k, e);
  }
  const commEdges = [...edgeMap.values()].sort((a, b) => b.count - a.count);

  const timeline: TimelineEvent[] = [...relevant]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, timelineLimit)
    .map((m) => ({ at: m.created_at, from: m.from_agent, to: m.to_agent, subject: m.subject, status: m.status }));

  const totals: OrgTotals = {
    workers: workers.length,
    activeTasks: workers.reduce((n, w) => n + w.activeTasks, 0),
    pendingApprovals: workers.reduce((n, w) => n + w.pendingApprovals, 0),
    blocked: workers.reduce((n, w) => n + w.blocked, 0),
    overloaded: workers.filter((w) => w.health === "overloaded").length,
  };

  return { founderKey: FOUNDER_NODE, workers, commEdges, timeline, totals };
}

/** Workers grouped by their manager (reporting tree), for the org chart. */
export function orgChartTiers(view: OrganizationView): { harmony: OrgWorker | null; specialists: OrgWorker[] } {
  const harmony = view.workers.find((w) => w.key === "harmony") ?? null;
  const specialists = view.workers.filter((w) => w.key !== "harmony");
  return { harmony, specialists };
}
