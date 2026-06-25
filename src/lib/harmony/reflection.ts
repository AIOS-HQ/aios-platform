import "server-only";

import { listWorkItems } from "@/lib/workforce/work-queue";
import { listObjectives } from "@/lib/workforce/objectives";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { listAutonomyAudit, getAutonomyState } from "@/lib/workforce/autonomy";
import { listJuliusEntries } from "@/lib/julius/service";
import { juliusRemember } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Harmony Reflection Engine — Harmony's executive learning.
 *
 * Harmony reflects on the workforce's ACTUAL execution (work queue, A2A
 * delegations/outcomes, approvals, autonomy decisions, objectives) and the
 * lessons specialists already recorded, then synthesises aggregate insights and
 * enriches Julius — the single organizational brain — with one consolidated,
 * dated reflection. It never invents insights: every insight is backed by real
 * stored rows (evidence > 0) with real example titles, and reflection ENRICHES
 * Julius (a `historical` entry via the standard juliusRemember path) rather than
 * standing up a parallel memory system. Company-scoped; degrades to an empty,
 * honest reflection when there is no data yet.
 */

export type ReflectionDimension =
  | "patterns"
  | "successes"
  | "failures"
  | "delegation"
  | "approvals"
  | "habits"
  | "preferences"
  | "recommendations"
  | "lessons";

export interface ReflectionInsight {
  dimension: ReflectionDimension;
  /** Short, grounded headline. */
  title: string;
  /** Grounded explanation, with the real counts behind it. */
  detail: string;
  /** Number of real stored rows backing this insight (always > 0). */
  evidence: number;
  /** Real example titles/subjects (never fabricated). */
  examples: string[];
}

export interface HarmonyReflection {
  hasData: boolean;
  generatedAt: string;
  insights: ReflectionInsight[];
  stats: {
    done: number;
    blocked: number;
    delegations: number;
    pendingApprovals: number;
    lessons: number;
  };
}

const agentName = (key: string) => getAiosAgent(key)?.name ?? key;
const daysAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

function topEntries<T>(map: Map<string, T>, score: (v: T) => number, n: number) {
  return [...map.entries()].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n);
}

/**
 * Build Harmony's reflection from real stored work. Read-only: computes
 * insights, writes nothing. Returns hasData=false (no insights) when there is
 * nothing real to reflect on yet.
 */
export async function buildHarmonyReflection(
  userId: string,
  companyId: string,
): Promise<HarmonyReflection> {
  const [work, objectives, messages, audit, lessons, autonomy] = await Promise.all([
    listWorkItems(userId, { companyId, limit: 300 }),
    listObjectives(userId, { companyId, limit: 200 }),
    listAgentMessages(userId, companyId, { limit: 300 }),
    listAutonomyAudit(userId, 300),
    listJuliusEntries(userId, companyId, { kind: "knowledge", limit: 100 }),
    getAutonomyState(userId),
  ]);

  const insights: ReflectionInsight[] = [];

  // ── Successful outcomes ────────────────────────────────────────────────
  const doneWork = work.filter((w) => w.status === "done");
  const completedMsgs = messages.filter(
    (m) => m.kind === "response" && m.status === "completed",
  );
  const successCount = doneWork.length + completedMsgs.length;
  if (successCount > 0) {
    insights.push({
      dimension: "successes",
      title: `${successCount} successful outcome${successCount === 1 ? "" : "s"}`,
      detail: `${doneWork.length} work item(s) completed and ${completedMsgs.length} delegated task(s) finished successfully.`,
      evidence: successCount,
      examples: [
        ...doneWork.map((w) => w.title),
        ...completedMsgs.map((m) => m.subject),
      ].slice(0, 3),
    });
  }

  // ── Failed / blocked outcomes ──────────────────────────────────────────
  const blockedWork = work.filter((w) => w.status === "blocked");
  const dismissedWork = work.filter((w) => w.status === "dismissed");
  const blockedMsgs = messages.filter((m) => m.status === "blocked");
  const failCount = blockedWork.length + dismissedWork.length + blockedMsgs.length;
  if (failCount > 0) {
    insights.push({
      dimension: "failures",
      title: `${failCount} blocked or abandoned item${failCount === 1 ? "" : "s"}`,
      detail: `${blockedWork.length} blocked and ${dismissedWork.length} dismissed work item(s); ${blockedMsgs.length} delegated task(s) reported blocked. Worth unblocking or rethinking.`,
      evidence: failCount,
      examples: [
        ...blockedWork.map((w) => w.title),
        ...blockedMsgs.map((m) => m.subject),
        ...dismissedWork.map((w) => w.title),
      ].slice(0, 3),
    });
  }

  // ── Delegation effectiveness ───────────────────────────────────────────
  const tasks = messages.filter((m) => m.kind === "task");
  const responses = messages.filter((m) => m.kind === "response");
  if (tasks.length > 0 || responses.length > 0) {
    const perAgent = new Map<string, { completed: number; blocked: number }>();
    for (const r of responses) {
      const row = perAgent.get(r.from_agent) ?? { completed: 0, blocked: 0 };
      if (r.status === "completed") row.completed += 1;
      else if (r.status === "blocked") row.blocked += 1;
      perAgent.set(r.from_agent, row);
    }
    const completed = responses.filter((r) => r.status === "completed").length;
    const blocked = responses.filter((r) => r.status === "blocked").length;
    const settled = completed + blocked;
    const rate = settled > 0 ? Math.round((completed / settled) * 100) : null;
    const ranked = topEntries(perAgent, (v) => v.completed - v.blocked, 3);
    insights.push({
      dimension: "delegation",
      title:
        rate !== null
          ? `Delegation is ${rate}% effective`
          : `${tasks.length} delegation${tasks.length === 1 ? "" : "s"} in flight`,
      detail: `${tasks.length} task(s) delegated across the workforce; ${completed} completed, ${blocked} blocked.`,
      evidence: tasks.length + responses.length,
      examples: ranked.map(
        ([key, v]) => `${agentName(key)}: ${v.completed} done / ${v.blocked} blocked`,
      ),
    });
  }

  // ── Approval bottlenecks ───────────────────────────────────────────────
  const pending = messages.filter((m) => m.status === "awaiting_approval");
  const proposedWork = work.filter((w) => w.status === "proposed");
  if (pending.length > 0 || proposedWork.length > 0) {
    const oldest = [...pending].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[0];
    const oldestAge = oldest ? daysAgo(oldest.created_at) : 0;
    insights.push({
      dimension: "approvals",
      title: `${pending.length} approval${pending.length === 1 ? "" : "s"} waiting on you`,
      detail:
        `${pending.length} delegation(s) await your sign-off` +
        (oldest ? `, the oldest for ${oldestAge} day(s)` : "") +
        `; ${proposedWork.length} proposed work item(s) haven't started.`,
      evidence: pending.length + proposedWork.length,
      examples: pending.map((m) => m.subject).slice(0, 3),
    });
  }

  // ── Recurring operational patterns ─────────────────────────────────────
  if (work.length > 0) {
    const catCount = new Map<string, number>();
    const agentCount = new Map<string, number>();
    for (const w of work) {
      if (w.category) catCount.set(w.category, (catCount.get(w.category) ?? 0) + 1);
      agentCount.set(w.agent, (agentCount.get(w.agent) ?? 0) + 1);
    }
    const topCat = topEntries(catCount, (v) => v, 1)[0];
    const topAgent = topEntries(agentCount, (v) => v, 1)[0];
    if (topAgent) {
      const parts: string[] = [];
      if (topCat) parts.push(`Most work is "${topCat[0]}" (${topCat[1]} of ${work.length}).`);
      parts.push(`${agentName(topAgent[0])} carries the most work (${topAgent[1]} item(s)).`);
      insights.push({
        dimension: "patterns",
        title: "Recurring operational pattern",
        detail: parts.join(" "),
        evidence: work.length,
        examples: topEntries(agentCount, (v) => v, 3).map(
          ([k, v]) => `${agentName(k)}: ${v} item(s)`,
        ),
      });
    }

    // ── Company habits — concentration / repeated blockers ───────────────
    const habitNotes: string[] = [];
    if (topCat && topCat[1] / work.length >= 0.5) {
      habitNotes.push(
        `Over half of all work is "${topCat[0]}" — the company concentrates there.`,
      );
    }
    const blockedTitles = new Map<string, number>();
    for (const w of blockedWork) {
      const k = w.title.trim().toLowerCase();
      blockedTitles.set(k, (blockedTitles.get(k) ?? 0) + 1);
    }
    const repeated = [...blockedTitles.entries()].filter(([, n]) => n > 1);
    if (repeated.length > 0) {
      habitNotes.push(`${repeated.length} blocker(s) recur more than once.`);
    }
    if (habitNotes.length > 0) {
      insights.push({
        dimension: "habits",
        title: "Company habit",
        detail: habitNotes.join(" "),
        evidence: work.length,
        examples: repeated.slice(0, 3).map(([t, n]) => `${t} (×${n})`),
      });
    }
  }

  // ── Founder preferences ────────────────────────────────────────────────
  const autoExecuted = audit.filter(
    (a) => a.decision === "auto_executed" || a.decision === "notified",
  ).length;
  const routed = audit.filter((a) => a.decision === "pending_approval").length;
  const denied = audit.filter((a) => a.decision === "denied").length;
  const mode = autonomy.global.mode;
  if (audit.length > 0 || mode !== "off") {
    insights.push({
      dimension: "preferences",
      title: `You operate Harmony in "${mode}" mode`,
      detail:
        `Across recorded decisions: ${autoExecuted} auto-executed, ${routed} routed for approval, ${denied} denied. ` +
        (mode === "bounded"
          ? "You let low-risk work run, holding the rest."
          : mode === "advisory"
            ? "You review before anything executes."
            : "You keep full manual control."),
      evidence: Math.max(audit.length, 1),
      examples: [],
    });
  }

  // ── Strategic recommendations (each grounded) ──────────────────────────
  const recExamples: string[] = [];
  if (blockedWork.length > 0)
    recExamples.push(`Unblock or reassign ${blockedWork.length} blocked item(s).`);
  if (pending.length > 0)
    recExamples.push(`Clear ${pending.length} pending approval(s) in the Approval Center.`);
  if (proposedWork.length > 0)
    recExamples.push(`Start or dismiss ${proposedWork.length} proposed work item(s).`);
  const activeObjectives = objectives.filter((o) => o.status === "active");
  const workObjectiveIds = new Set(
    work.map((w) => w.objective_id).filter((id): id is string => Boolean(id)),
  );
  const objectivesWithoutWork = activeObjectives.filter(
    (o) => !workObjectiveIds.has(o.id),
  );
  if (objectivesWithoutWork.length > 0)
    recExamples.push(
      `Generate work for ${objectivesWithoutWork.length} active objective(s) with none.`,
    );
  if (recExamples.length > 0) {
    insights.push({
      dimension: "recommendations",
      title: `${recExamples.length} strategic recommendation${recExamples.length === 1 ? "" : "s"}`,
      detail: "Grounded next moves drawn from current work, approvals, and objectives.",
      evidence: recExamples.length,
      examples: recExamples.slice(0, 4),
    });
  }

  // ── Organizational lessons (already in Julius) ─────────────────────────
  if (lessons.length > 0) {
    const successLessons = lessons.filter((e) => e.title.startsWith("Pattern"));
    const blockerLessons = lessons.filter((e) => e.title.startsWith("Blocker"));
    insights.push({
      dimension: "lessons",
      title: `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} captured`,
      detail: `${successLessons.length} success pattern(s) and ${blockerLessons.length} blocker lesson(s) recorded by the workforce in Julius.`,
      evidence: lessons.length,
      examples: lessons.map((e) => e.title).slice(0, 3),
    });
  }

  return {
    hasData: insights.length > 0,
    generatedAt: new Date().toISOString(),
    insights,
    stats: {
      done: doneWork.length,
      blocked: blockedWork.length,
      delegations: tasks.length,
      pendingApprovals: pending.length,
      lessons: lessons.length,
    },
  };
}

/**
 * Enrich Julius with one consolidated, dated reflection (kind `historical`).
 * Enrichment, not duplication: it synthesises aggregate insights the per-task
 * lessons don't capture, and is deduped per day so repeated runs don't spam the
 * brain. Returns the number of entries written (0 or 1). No-ops when the
 * reflection has no real data.
 */
export async function recordHarmonyReflection(
  userId: string,
  companyId: string,
  reflection: HarmonyReflection,
): Promise<number> {
  if (!reflection.hasData) return 0;

  const date = reflection.generatedAt.slice(0, 10);
  const title = `Harmony executive reflection — ${date}`;

  // Dedup per day: don't write the same dated reflection twice.
  const existing = await listJuliusEntries(userId, companyId, {
    kind: "historical",
    limit: 50,
  });
  if (existing.some((e) => e.title === title)) return 0;

  const content = reflection.insights
    .map((i) => `• [${i.dimension}] ${i.title} — ${i.detail}`)
    .join("\n");

  const saved = await juliusRemember({
    userId,
    companyId,
    agent: "harmony",
    kind: "historical",
    title,
    content,
    importance: 3,
    refs: { kind: "harmony_reflection", generatedAt: reflection.generatedAt },
  });

  return saved ? 1 : 0;
}
