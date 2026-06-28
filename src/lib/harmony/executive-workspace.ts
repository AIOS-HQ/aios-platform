import "server-only";

import { listDepartments } from "@/lib/data/os/departments";
import { listActivity } from "@/lib/data/os/activity";
import { listOpsEvents, type OpsEvent } from "@/lib/observability/ops";
import { runGithubRead, type GitHubReadResult } from "@/lib/integrations/clients/github";
import { runVercelDiagnostics } from "@/lib/integrations/clients/vercel-diagnostics";
import type { DiagnosticsResult } from "@/lib/integrations/clients/supabase-diagnostics";
import {
  buildHarmonyExecutiveIntelligence,
  type ExecutiveIntelligence,
} from "@/lib/harmony/executive-intelligence";
import { createMasonNativeRuntimePlan } from "@/lib/harmony/code/mason";
import { getAiosAgent } from "@/lib/workforce/registry";
import {
  buildOperationalDigitalTwinFromSignals,
  type OperationalDigitalTwin,
} from "@/lib/harmony/operational-digital-twin";
import type { Department, ActivityEvent } from "@/types/database";

export type ExecutiveHealth = "critical" | "attention" | "healthy" | "quiet";
export type ExecutiveConfidence = "high" | "medium" | "low";

export interface ExecutiveDepartmentStatus {
  key: string;
  name: string;
  health: ExecutiveHealth;
  summary: string;
  signals: string[];
}

export interface ExecutiveSnapshot {
  companyHealth: ExecutiveHealth;
  operationalHealth: ExecutiveHealth;
  engineeringHealth: ExecutiveHealth;
  aiWorkforceHealth: ExecutiveHealth;
  criticalAlerts: string[];
  recommendedPriorities: string[];
  suggestedNextActions: string[];
  confidenceLevel: ExecutiveConfidence;
}

export interface ExecutiveWorkspace {
  generatedAt: string;
  companyId: string | null;
  snapshot: ExecutiveSnapshot;
  departments: ExecutiveDepartmentStatus[];
  intelligence: ExecutiveIntelligence;
  recentExecutionHistory: string[];
  productionHealthSignals: string[];
  masonEngineeringActivity: string[];
  operationalDigitalTwin: OperationalDigitalTwin;
  promptContext: string;
}

const REQUIRED_DEPARTMENTS = [
  { key: "executive", name: "Executive" },
  { key: "personal", name: "Personal" },
  { key: "business", name: "Business" },
  { key: "finance", name: "Finance" },
  { key: "marketing", name: "Marketing" },
  { key: "sales", name: "Sales" },
  { key: "customer_success", name: "Customer Success" },
  { key: "operations", name: "Operations" },
  { key: "engineering", name: "Engineering (Mason)" },
  { key: "legal", name: "Legal" },
  { key: "hr", name: "HR" },
  { key: "ai_workforce", name: "AI Workforce" },
] as const;

const HEALTH_SCORE: Record<ExecutiveHealth, number> = {
  critical: 4,
  attention: 3,
  healthy: 2,
  quiet: 1,
};

function worstHealth(values: ExecutiveHealth[]): ExecutiveHealth {
  return values.sort((a, b) => HEALTH_SCORE[b] - HEALTH_SCORE[a])[0] ?? "quiet";
}

function unique(items: string[], limit: number): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function healthFromCounts(critical: number, attention: number, active = 0): ExecutiveHealth {
  if (critical > 0) return "critical";
  if (attention > 0) return "attention";
  return active > 0 ? "healthy" : "quiet";
}

function confidenceFrom(intelligence: ExecutiveIntelligence): ExecutiveConfidence {
  const hasOrgSignal =
    intelligence.organization.metrics.completedExecutions > 0 ||
    intelligence.organization.metrics.blockedExecutions > 0 ||
    intelligence.organization.metrics.collaborations > 0;
  const hasJulius = intelligence.metrics.juliusContext > 0;
  const hasSkills = intelligence.skills.metrics.total > 0;
  const hasPlanning = Boolean(intelligence.planning.current);
  const score = [hasOrgSignal, hasJulius, hasSkills, hasPlanning].filter(Boolean).length;
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function departmentRecord(departments: Department[], key: string): Department | undefined {
  return departments.find((department) => department.key === key);
}

function activitySummaries(activity: ActivityEvent[], limit = 6): string[] {
  return activity.slice(0, limit).map((event) => event.summary);
}

function productionSignals(ops: OpsEvent[], intelligence: ExecutiveIntelligence): string[] {
  const unresolved = ops.filter((event) => !event.resolved);
  const errors = unresolved.filter((event) => event.level === "error");
  return unique(
    [
      errors.length ? `${errors.length} unresolved production error(s)` : "",
      unresolved.length ? `${unresolved.length} unresolved operational event(s)` : "",
      intelligence.metrics.connectorIssues
        ? `${intelligence.metrics.connectorIssues} connector issue(s) need attention`
        : "Connected services report no critical connector issues",
      ...unresolved.slice(0, 3).map((event) => `${event.source}: ${event.message}`),
    ],
    5,
  );
}

function masonSignals(intelligence: ExecutiveIntelligence): string[] {
  const masonWork = intelligence.workforce.find((signal) => signal.agent === "mason");
  const masonRecommendations = intelligence.workforceOptimization.recommendations.filter(
    (rec) =>
      rec.recommendedOwner === "mason" ||
      rec.affectedAgents.includes("mason") ||
      rec.recommendedCollaborators.includes("mason"),
  );
  const masonPlan = masonRecommendations[0]
    ? createMasonNativeRuntimePlan({
        objective: masonRecommendations[0].title,
        detail: masonRecommendations[0].reason,
        repository: "AIOS-HQ/aios-platform",
      })
    : null;

  return unique(
    [
      masonWork
        ? `${masonWork.activeWork} active engineering item(s), ${masonWork.blockedWork} blocked`
        : "No active Mason work queue signal",
      ...masonRecommendations.slice(0, 3).map((rec) => rec.title),
      masonPlan ? masonPlan.boundarySummary : "",
    ],
    5,
  );
}

function buildDepartmentStatuses(input: {
  departments: Department[];
  intelligence: ExecutiveIntelligence;
  recentExecutionHistory: string[];
  productionHealthSignals: string[];
  masonEngineeringActivity: string[];
}): ExecutiveDepartmentStatus[] {
  const { intelligence } = input;
  const approvalSignals = intelligence.metrics.pendingApprovals;
  const workforceBlocked = intelligence.metrics.blockedWork;
  const connectorIssues = intelligence.metrics.connectorIssues;
  const oieBottleneck = intelligence.organization.bottlenecks[0];
  const strongestOpportunity = intelligence.workforceOptimization.strongestOpportunity;

  return REQUIRED_DEPARTMENTS.map((department) => {
    const db = departmentRecord(input.departments, department.key);
    const baseSignals: string[] = db?.status ? [`Configured status: ${db.status}`] : [];
    if (department.key === "executive") {
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(
          intelligence.auditor.risks.length,
          approvalSignals + intelligence.recommendations.length,
          intelligence.metrics.activeObjectives,
        ),
        summary: `${intelligence.metrics.activeObjectives} active objective(s), ${intelligence.recommendations.length} executive recommendation(s).`,
        signals: unique(
          [
            ...baseSignals,
            ...intelligence.recommendations.slice(0, 3).map((rec) => rec.title),
          ],
          4,
        ),
      };
    }
    if (department.key === "operations") {
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(connectorIssues, workforceBlocked, intelligence.metrics.activeWork),
        summary: `${intelligence.metrics.activeWork} active work item(s), ${workforceBlocked} blocked.`,
        signals: unique([...baseSignals, ...input.productionHealthSignals], 4),
      };
    }
    if (department.key === "engineering") {
      const mason = intelligence.workforce.find((signal) => signal.agent === "mason");
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(mason?.blockedWork ?? 0, connectorIssues, mason?.activeWork ?? 0),
        summary: input.masonEngineeringActivity[0] ?? "Mason engineering boundary is ready when scoped.",
        signals: unique([...baseSignals, ...input.masonEngineeringActivity], 4),
      };
    }
    if (department.key === "ai_workforce") {
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(workforceBlocked, approvalSignals, intelligence.metrics.activeAgents),
        summary: `${intelligence.metrics.activeAgents} active agent(s), ${approvalSignals} pending approval signal(s).`,
        signals: unique(
          [
            ...baseSignals,
            strongestOpportunity?.title ?? "",
            oieBottleneck?.title ?? "",
            intelligence.organization.strongestCollaboration?.label ?? "",
          ],
          4,
        ),
      };
    }
    if (department.key === "marketing") {
      const catalyst = intelligence.workforce.find((signal) => signal.agent === "catalyst");
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(catalyst?.blockedWork ?? 0, catalyst?.pendingApprovals ?? 0, catalyst?.activeWork ?? 0),
        summary: `${catalyst?.activeWork ?? 0} Catalyst item(s) active.`,
        signals: unique(baseSignals, 4),
      };
    }
    if (department.key === "customer_success" || department.key === "sales") {
      const ambassador = intelligence.workforce.find((signal) => signal.agent === "ambassador");
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(
          ambassador?.blockedWork ?? 0,
          ambassador?.pendingApprovals ?? 0,
          ambassador?.activeWork ?? 0,
        ),
        summary: `${ambassador?.activeWork ?? 0} Ambassador communication item(s) active.`,
        signals: unique(baseSignals, 4),
      };
    }
    if (department.key === "finance" || department.key === "legal") {
      const ledger = intelligence.workforce.find((signal) => signal.agent === "ledger");
      const aegis = intelligence.workforce.find((signal) => signal.agent === "aegis");
      const critical = (ledger?.blockedWork ?? 0) + (aegis?.blockedWork ?? 0);
      const attention = (ledger?.pendingApprovals ?? 0) + (aegis?.pendingApprovals ?? 0);
      return {
        key: department.key,
        name: department.name,
        health: healthFromCounts(critical, attention, (ledger?.activeWork ?? 0) + (aegis?.activeWork ?? 0)),
        summary: `${attention} governance approval signal(s).`,
        signals: unique(baseSignals, 4),
      };
    }
    return {
      key: department.key,
      name: department.name,
      health: db?.status === "active" ? "healthy" : "quiet",
      summary: db?.description ?? "No active operational signal in this workspace window.",
      signals: unique([...baseSignals, ...input.recentExecutionHistory.slice(0, 1)], 3),
    };
  });
}

export function buildExecutiveSnapshotFromIntelligence(input: {
  intelligence: ExecutiveIntelligence;
  departments: Department[];
  recentActivity: ActivityEvent[];
  opsEvents: OpsEvent[];
  github?: GitHubReadResult | null;
  vercel?: DiagnosticsResult | null;
}): Omit<ExecutiveWorkspace, "companyId" | "promptContext"> {
  const intelligence = input.intelligence;
  const recentExecutionHistory = activitySummaries(input.recentActivity);
  const productionHealthSignals = productionSignals(input.opsEvents, intelligence);
  const masonEngineeringActivity = masonSignals(intelligence);
  const departments = buildDepartmentStatuses({
    departments: input.departments,
    intelligence,
    recentExecutionHistory,
    productionHealthSignals,
    masonEngineeringActivity,
  });
  const operationalHealth = healthFromCounts(
    input.opsEvents.filter((event) => !event.resolved && event.level === "error").length +
      intelligence.metrics.connectorIssues,
    input.opsEvents.filter((event) => !event.resolved && event.level === "warn").length +
      intelligence.metrics.blockedWork,
    intelligence.metrics.activeWork,
  );
  const engineering = departments.find((department) => department.key === "engineering");
  const aiWorkforce = departments.find((department) => department.key === "ai_workforce");
  const criticalAlerts = unique(
    [
      ...intelligence.auditor.risks.map((risk) => risk.title),
      ...input.opsEvents
        .filter((event) => !event.resolved && event.level === "error")
        .map((event) => event.message),
      ...intelligence.organization.bottlenecks
        .filter((bottleneck) => bottleneck.severity === "high")
        .map((bottleneck) => bottleneck.title),
    ],
    6,
  );
  const recommendedPriorities = unique(
    [
      ...intelligence.recommendations.map((rec) => rec.title),
      ...intelligence.workforceOptimization.recommendations.map((rec) => rec.title),
      intelligence.planning.current?.objective ?? "",
    ],
    6,
  );
  const suggestedNextActions = unique(
    [
      ...intelligence.recommendations.map((rec) => rec.detail),
      intelligence.planning.current?.executiveSummary ?? "",
      intelligence.workforceOptimization.strongestOpportunity?.suggestedAction ?? "",
    ],
    6,
  );
  const snapshot: ExecutiveSnapshot = {
    companyHealth: worstHealth([
      intelligence.situation === "critical"
        ? "critical"
        : intelligence.situation === "attention"
          ? "attention"
          : intelligence.situation === "operating"
            ? "healthy"
            : "quiet",
      operationalHealth,
      engineering?.health ?? "quiet",
      aiWorkforce?.health ?? "quiet",
    ]),
    operationalHealth,
    engineeringHealth: engineering?.health ?? "quiet",
    aiWorkforceHealth: aiWorkforce?.health ?? "quiet",
    criticalAlerts,
    recommendedPriorities,
    suggestedNextActions,
    confidenceLevel: confidenceFrom(intelligence),
  };

  const base: Omit<ExecutiveWorkspace, "companyId" | "promptContext" | "operationalDigitalTwin"> = {
    generatedAt: new Date().toISOString(),
    snapshot,
    departments,
    intelligence,
    recentExecutionHistory,
    productionHealthSignals,
    masonEngineeringActivity,
  };
  const workspaceForTwin = {
    ...base,
    companyId: null,
    promptContext: "",
  };
  const operationalDigitalTwin = buildOperationalDigitalTwinFromSignals({
    workspace: workspaceForTwin,
    activity: input.recentActivity,
    opsEvents: input.opsEvents,
    github: input.github ?? null,
    vercel: input.vercel ?? null,
  });

  return {
    ...base,
    operationalDigitalTwin,
  };
}

export function formatExecutiveWorkspaceForPrompt(workspace: ExecutiveWorkspace): string {
  const s = workspace.snapshot;
  const departments = workspace.departments
    .map((department) => `- ${department.name}: ${department.health}; ${department.summary}`)
    .join("\n");
  return [
    "Executive Workspace Context",
    `Generated: ${workspace.generatedAt}`,
    `Company health: ${s.companyHealth}`,
    `Operational health: ${s.operationalHealth}`,
    `Engineering health: ${s.engineeringHealth}`,
    `AI workforce health: ${s.aiWorkforceHealth}`,
    `Confidence: ${s.confidenceLevel}`,
    `Active objectives: ${workspace.intelligence.metrics.activeObjectives}`,
    `Pending approvals: ${workspace.intelligence.metrics.pendingApprovals}`,
    `Workforce health: ${workspace.intelligence.metrics.activeAgents} active agent(s), ${workspace.intelligence.metrics.blockedWork} blocked work signal(s)`,
    `Department awareness:\n${departments}`,
    s.criticalAlerts.length ? `Critical alerts:\n${s.criticalAlerts.map((item) => `- ${item}`).join("\n")}` : "",
    s.recommendedPriorities.length
      ? `Recommended priorities:\n${s.recommendedPriorities.map((item) => `- ${item}`).join("\n")}`
      : "",
    s.suggestedNextActions.length
      ? `Suggested next actions:\n${s.suggestedNextActions.map((item) => `- ${item}`).join("\n")}`
      : "",
    workspace.intelligence.organization.bottlenecks.length
      ? `OIE bottlenecks:\n${workspace.intelligence.organization.bottlenecks
          .slice(0, 3)
          .map((bottleneck) => `- ${bottleneck.title}: ${bottleneck.recommendation}`)
          .join("\n")}`
      : "",
    workspace.intelligence.planning.current
      ? `Adaptive Planning priority: ${workspace.intelligence.planning.current.executiveSummary}`
      : "",
    workspace.intelligence.skills.metrics.total
      ? `Company Skills evolution: ${workspace.intelligence.skills.metrics.total} skill(s), highest confidence ${workspace.intelligence.skills.metrics.highestConfidence}/100.`
      : "",
    workspace.intelligence.julius.total
      ? `Julius memory: ${workspace.intelligence.julius.total} awareness item(s); recent ${workspace.intelligence.julius.recent
          .slice(0, 3)
          .map((entry) => entry.title)
          .join(", ")}`
      : "",
    workspace.masonEngineeringActivity.length
      ? `Mason engineering activity:\n${workspace.masonEngineeringActivity.map((item) => `- ${item}`).join("\n")}`
      : "",
    workspace.productionHealthSignals.length
      ? `Production/GitHub/Vercel signals:\n${workspace.productionHealthSignals.map((item) => `- ${item}`).join("\n")}`
      : "",
    workspace.operationalDigitalTwin.promptContext,
    "Use this context before giving Founder recommendations. Behave as an Executive Chief of Staff, not a generic assistant.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function buildExecutiveWorkspace(
  userId: string,
  companyId: string | null,
): Promise<ExecutiveWorkspace> {
  const [intelligence, departments, recentActivity, opsEvents, github, vercel] = await Promise.all([
    buildHarmonyExecutiveIntelligence(userId, companyId),
    companyId ? listDepartments(companyId) : Promise.resolve([]),
    listActivity({ companyId: companyId ?? undefined, limit: 25 }),
    listOpsEvents(userId, { limit: 25, unresolvedOnly: false }),
    runGithubRead(userId, "monitor_deployment", { repo: process.env.AIOS_GITHUB_REPO ?? "AIOS-HQ/aios-platform" }),
    runVercelDiagnostics(userId),
  ]);
  const base = buildExecutiveSnapshotFromIntelligence({
    intelligence,
    departments,
    recentActivity,
    opsEvents,
    github,
    vercel,
  });
  const workspace: ExecutiveWorkspace = {
    ...base,
    companyId,
    promptContext: "",
  };
  workspace.promptContext = formatExecutiveWorkspaceForPrompt(workspace);
  return workspace;
}

export function departmentNamesForWorkspace(): string[] {
  return REQUIRED_DEPARTMENTS.map((department) => department.name);
}

export function agentLabel(agent: string): string {
  return getAiosAgent(agent)?.name ?? agent;
}
