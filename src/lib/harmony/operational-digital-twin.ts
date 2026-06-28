import "server-only";

import type { ExecutiveWorkspace } from "@/lib/harmony/executive-workspace";
import type { GitHubReadResult } from "@/lib/integrations/clients/github";
import type { DiagnosticsResult } from "@/lib/integrations/clients/supabase-diagnostics";
import type { ActivityEvent } from "@/types/database";
import type { OpsEvent } from "@/lib/observability/ops";

export type OperationalTwinHealth = "critical" | "attention" | "healthy" | "quiet";
type OperationalTwinWorkspace = Omit<ExecutiveWorkspace, "operationalDigitalTwin" | "promptContext"> & {
  promptContext?: string;
};

export interface OperationalTwinSignal {
  id: string;
  label: string;
  health: OperationalTwinHealth;
  summary: string;
  evidence: string[];
}

export interface OperationalTwinRecommendation {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  action: string;
  reusedSystem: string;
}

export interface OperationalDigitalTwin {
  generatedAt: string;
  health: OperationalTwinHealth;
  summary: string;
  systems: OperationalTwinSignal[];
  deploymentAwareness: OperationalTwinSignal[];
  longitudinalIntelligence: string[];
  executionTelemetry: string[];
  founderRecommendations: OperationalTwinRecommendation[];
  launchReadiness: {
    status: "ready" | "needs_attention" | "blocked";
    blockers: string[];
    opportunities: string[];
  };
  promptContext: string;
}

const HEALTH_SCORE: Record<OperationalTwinHealth, number> = {
  critical: 4,
  attention: 3,
  healthy: 2,
  quiet: 1,
};

function unique(items: string[], limit = 8): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function worstHealth(values: OperationalTwinHealth[]): OperationalTwinHealth {
  return values.sort((a, b) => HEALTH_SCORE[b] - HEALTH_SCORE[a])[0] ?? "quiet";
}

function healthFromCounts(critical: number, attention: number, active = 0): OperationalTwinHealth {
  if (critical > 0) return "critical";
  if (attention > 0) return "attention";
  return active > 0 ? "healthy" : "quiet";
}

function gitHubEvidence(result: GitHubReadResult | null): string[] {
  if (!result?.ok) return ["GitHub execution status unavailable through connected diagnostics."];
  const runs = Array.isArray(result.data?.runs) ? result.data.runs : [];
  if (runs.length === 0) return ["GitHub connected, no recent workflow runs returned."];
  return runs.slice(0, 4).map((run) => {
    const row = run as { name?: string; status?: string; conclusion?: string };
    return `${row.name ?? "workflow"}: ${row.status ?? "unknown"}${row.conclusion ? `/${row.conclusion}` : ""}`;
  });
}

function gitHubHealth(result: GitHubReadResult | null): OperationalTwinHealth {
  if (!result?.ok) return "attention";
  const runs = Array.isArray(result.data?.runs) ? result.data.runs : [];
  if (runs.some((run) => (run as { conclusion?: string }).conclusion === "failure")) return "critical";
  if (runs.some((run) => (run as { status?: string }).status !== "completed")) return "attention";
  return runs.length > 0 ? "healthy" : "quiet";
}

function vercelEvidence(result: DiagnosticsResult | null): string[] {
  if (!result?.connected) return ["Vercel diagnostics are not connected."];
  return result.items.map((item) => `${item.id}: ${item.detail}`);
}

function vercelHealth(result: DiagnosticsResult | null): OperationalTwinHealth {
  if (!result?.connected) return "attention";
  if (result.items.some((item) => !item.ok && /deployment|build/i.test(item.id))) return "critical";
  if (result.items.some((item) => !item.ok)) return "attention";
  return "healthy";
}

function recentExecution(activity: ActivityEvent[]): string[] {
  return activity
    .filter((event) => ["agent_action", "approval", "system"].includes(event.kind))
    .slice(0, 8)
    .map((event) => `${event.kind}: ${event.summary}`);
}

function longitudinalPatterns(workspace: OperationalTwinWorkspace, activity: ActivityEvent[]): string[] {
  const organization = workspace.intelligence.organization;
  const patterns = [
    organization.planningContext,
    organization.strongestCollaboration
      ? `Strongest collaboration: ${organization.strongestCollaboration.label} at ${organization.strongestCollaboration.reliability}% reliability.`
      : "",
    organization.highestPerformingCollaboration
      ? `Highest performing collaboration: ${organization.highestPerformingCollaboration.label}.`
      : "",
    organization.mostEffectivePattern
      ? `Reusable execution pattern: ${organization.mostEffectivePattern.title}.`
      : "",
    ...organization.bottlenecks.slice(0, 3).map((bottleneck) => `${bottleneck.title}: ${bottleneck.recommendation}`),
    activity.length ? `${activity.length} recent Activity Event signal(s) available for longitudinal context.` : "",
  ];
  return unique(patterns, 8);
}

function recommendations(input: {
  workspace: OperationalTwinWorkspace;
  opsEvents: OpsEvent[];
  gitHubHealth: OperationalTwinHealth;
  vercelHealth: OperationalTwinHealth;
}): OperationalTwinRecommendation[] {
  const recs: OperationalTwinRecommendation[] = [];
  if (input.workspace.snapshot.criticalAlerts.length > 0) {
    recs.push({
      id: "critical_alerts",
      priority: "critical",
      title: "Resolve critical executive alerts",
      action: input.workspace.snapshot.criticalAlerts[0],
      reusedSystem: "Executive Workspace",
    });
  }
  const unresolved = input.opsEvents.filter((event) => !event.resolved);
  if (unresolved.length > 0) {
    recs.push({
      id: "ops_unresolved",
      priority: unresolved.some((event) => event.level === "error") ? "critical" : "high",
      title: "Clear unresolved operational events",
      action: `${unresolved.length} unresolved event(s) should be reviewed through Operations.`,
      reusedSystem: "Activity Events and Ops Events",
    });
  }
  if (input.gitHubHealth !== "healthy" || input.vercelHealth !== "healthy") {
    recs.push({
      id: "deployment_awareness",
      priority: input.gitHubHealth === "critical" || input.vercelHealth === "critical" ? "critical" : "high",
      title: "Verify deployment execution signals",
      action: "Review GitHub workflow and Vercel deployment diagnostics before launch decisions.",
      reusedSystem: "GitHub and Vercel diagnostics",
    });
  }
  if (input.workspace.intelligence.workforceOptimization.strongestOpportunity) {
    recs.push({
      id: "workforce_opportunity",
      priority: "medium",
      title: input.workspace.intelligence.workforceOptimization.strongestOpportunity.title,
      action: input.workspace.intelligence.workforceOptimization.strongestOpportunity.suggestedAction,
      reusedSystem: "Workforce Optimization",
    });
  }
  if (input.workspace.intelligence.planning.current) {
    recs.push({
      id: "adaptive_plan",
      priority: "medium",
      title: "Continue the current Adaptive Planning priority",
      action: input.workspace.intelligence.planning.current.executiveSummary,
      reusedSystem: "Adaptive Planning",
    });
  }
  return recs.slice(0, 8);
}

export function formatOperationalDigitalTwinForPrompt(twin: OperationalDigitalTwin): string {
  return [
    "Operational Digital Twin",
    `Health: ${twin.health}`,
    `Summary: ${twin.summary}`,
    `Launch readiness: ${twin.launchReadiness.status}`,
    twin.launchReadiness.blockers.length
      ? `Launch blockers:\n${twin.launchReadiness.blockers.map((item) => `- ${item}`).join("\n")}`
      : "Launch blockers: none",
    `System state:\n${twin.systems.map((signal) => `- ${signal.label}: ${signal.health}; ${signal.summary}`).join("\n")}`,
    `Deployment awareness:\n${twin.deploymentAwareness.map((signal) => `- ${signal.label}: ${signal.health}; ${signal.summary}`).join("\n")}`,
    twin.longitudinalIntelligence.length
      ? `Longitudinal intelligence:\n${twin.longitudinalIntelligence.map((item) => `- ${item}`).join("\n")}`
      : "",
    twin.executionTelemetry.length
      ? `Execution telemetry:\n${twin.executionTelemetry.map((item) => `- ${item}`).join("\n")}`
      : "",
    twin.founderRecommendations.length
      ? `Founder recommendations:\n${twin.founderRecommendations
          .map((rec) => `- ${rec.title}: ${rec.action} (${rec.reusedSystem})`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildOperationalDigitalTwinFromSignals(input: {
  workspace: OperationalTwinWorkspace;
  activity: ActivityEvent[];
  opsEvents: OpsEvent[];
  github: GitHubReadResult | null;
  vercel: DiagnosticsResult | null;
}): OperationalDigitalTwin {
  const unresolvedOps = input.opsEvents.filter((event) => !event.resolved);
  const opsHealth = healthFromCounts(
    unresolvedOps.filter((event) => event.level === "error").length,
    unresolvedOps.filter((event) => event.level === "warn").length,
    input.opsEvents.length,
  );
  const gitHubTwinHealth = gitHubHealth(input.github);
  const vercelTwinHealth = vercelHealth(input.vercel);
  const executiveHealth = input.workspace.snapshot.companyHealth;
  const health = worstHealth([opsHealth, gitHubTwinHealth, vercelTwinHealth, executiveHealth]);
  const systems: OperationalTwinSignal[] = [
    {
      id: "executive_workspace",
      label: "Executive Workspace",
      health: executiveHealth,
      summary: `${input.workspace.snapshot.recommendedPriorities.length} priority signal(s), ${input.workspace.snapshot.criticalAlerts.length} critical alert(s).`,
      evidence: input.workspace.snapshot.recommendedPriorities,
    },
    {
      id: "oie",
      label: "Organizational Intelligence",
      health: healthFromCounts(
        input.workspace.intelligence.organization.metrics.blockedExecutions,
        input.workspace.intelligence.organization.bottlenecks.length,
        input.workspace.intelligence.organization.metrics.completedExecutions,
      ),
      summary: `${input.workspace.intelligence.organization.metrics.completedExecutions} completed execution(s), ${input.workspace.intelligence.organization.metrics.blockedExecutions} blocked.`,
      evidence: input.workspace.intelligence.organization.bottlenecks.map((bottleneck) => bottleneck.title),
    },
    {
      id: "company_skills",
      label: "Company Skills",
      health: input.workspace.intelligence.skills.metrics.total > 0 ? "healthy" : "quiet",
      summary: `${input.workspace.intelligence.skills.metrics.total} skill(s), highest confidence ${input.workspace.intelligence.skills.metrics.highestConfidence}/100.`,
      evidence: input.workspace.intelligence.skills.relevant.slice(0, 4).map((skill) => skill.title),
    },
    {
      id: "aeo",
      label: "Autonomous Execution Orchestrator",
      health: input.workspace.snapshot.operationalHealth,
      summary: `${input.workspace.intelligence.metrics.activeWork} active work signal(s), ${input.workspace.intelligence.metrics.pendingApprovals} pending approval(s).`,
      evidence: input.workspace.recentExecutionHistory,
    },
  ];
  const deploymentAwareness: OperationalTwinSignal[] = [
    {
      id: "github",
      label: "GitHub execution",
      health: gitHubTwinHealth,
      summary: input.github?.ok ? "GitHub workflow signals are available." : "GitHub workflow signals unavailable.",
      evidence: gitHubEvidence(input.github),
    },
    {
      id: "vercel",
      label: "Vercel production",
      health: vercelTwinHealth,
      summary: input.vercel?.connected ? "Vercel deployment diagnostics are available." : "Vercel diagnostics unavailable.",
      evidence: vercelEvidence(input.vercel),
    },
    {
      id: "ops_events",
      label: "Production health",
      health: opsHealth,
      summary: `${unresolvedOps.length} unresolved operational event(s).`,
      evidence: input.opsEvents.slice(0, 5).map((event) => `${event.level}: ${event.source} - ${event.message}`),
    },
  ];
  const founderRecommendations = recommendations({
    workspace: input.workspace,
    opsEvents: input.opsEvents,
    gitHubHealth: gitHubTwinHealth,
    vercelHealth: vercelTwinHealth,
  });
  const blockers = unique(
    [
      ...input.workspace.snapshot.criticalAlerts,
      ...unresolvedOps.filter((event) => event.level === "error").map((event) => event.message),
      gitHubTwinHealth === "critical" ? "GitHub workflow failure detected." : "",
      vercelTwinHealth === "critical" ? "Vercel deployment is not ready." : "",
    ],
    8,
  );
  const opportunities = unique(
    [
      ...input.workspace.snapshot.suggestedNextActions,
      ...founderRecommendations.map((rec) => rec.action),
    ],
    8,
  );
  const twin: OperationalDigitalTwin = {
    generatedAt: new Date().toISOString(),
    health,
    summary: `${systems.length} core system signal(s), ${deploymentAwareness.length} deployment/operations signal(s), ${founderRecommendations.length} Founder recommendation(s).`,
    systems,
    deploymentAwareness,
    longitudinalIntelligence: longitudinalPatterns(input.workspace, input.activity),
    executionTelemetry: unique([...recentExecution(input.activity), ...input.workspace.recentExecutionHistory], 10),
    founderRecommendations,
    launchReadiness: {
      status: blockers.length > 0 ? "blocked" : health === "attention" ? "needs_attention" : "ready",
      blockers,
      opportunities,
    },
    promptContext: "",
  };
  twin.promptContext = formatOperationalDigitalTwinForPrompt(twin);
  return twin;
}
