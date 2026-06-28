import "server-only";

import { buildExecutiveWorkspace, type ExecutiveWorkspace } from "@/lib/harmony/executive-workspace";
import { listObjectives, type AgentObjective } from "@/lib/workforce/objectives";
import { listWorkItems as listAgentWorkItems, type WorkItem as AgentWorkItem } from "@/lib/workforce/work-queue";
import { listWorkItems as listOsWorkItems } from "@/lib/data/os/work-items";
import { listApprovals } from "@/lib/data/os/approvals";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  createMasonNativeRuntimePlan,
  masonOwnsEngineeringTask,
  type MasonNativeRuntimePlan,
} from "@/lib/harmony/code/mason";
import { getAiosAgent, type AiosAgentKey } from "@/lib/workforce/registry";
import type { AdaptiveExecutionPlan, AdaptivePlanPhase } from "@/lib/harmony/adaptive-planning";
import type { Approval, WorkItem as OsWorkItem } from "@/types/database";

export type AeoPhaseStatus = "ready" | "in_progress" | "paused_for_approval" | "blocked" | "complete";
export type AeoBlockerKind =
  | "approval"
  | "dependency"
  | "blocked_work"
  | "production_health"
  | "connector"
  | "mason_boundary";

export interface AeoBlocker {
  id: string;
  kind: AeoBlockerKind;
  title: string;
  detail: string;
  owner: string;
  resumeTrigger: string;
}

export interface AeoPhase {
  id: string;
  title: string;
  owner: AiosAgentKey;
  ownerLabel: string;
  status: AeoPhaseStatus;
  order: number;
  dependencies: string[];
  approvalRequired: boolean;
  blockers: AeoBlocker[];
  summary: string;
}

export interface AeoOrchestrationPlan {
  generatedAt: string;
  userId: string;
  companyId: string | null;
  objective: string;
  status: AeoPhaseStatus;
  executionOrder: string[];
  phases: AeoPhase[];
  blockers: AeoBlocker[];
  nextRecommendedAction: string;
  estimatedCompletion: string;
  confidence: "high" | "medium" | "low";
  affectedDepartments: string[];
  masonRuntimePlan: MasonNativeRuntimePlan | null;
  executiveWorkspace: ExecutiveWorkspace;
  promptContext: string;
}

const ENGINEERING_OWNER = "mason" satisfies AiosAgentKey;
const DEFAULT_WORKFORCE_OWNER = "harmony" satisfies AiosAgentKey;
const NON_ENGINEERING_SEQUENCE: AiosAgentKey[] = ["harmony", "horizon", "atlas", "catalyst", "ambassador", "pulse"];
const ACTIVE_OS_WORK = new Set(["pending", "in_progress", "awaiting_approval", "blocked"]);
const ACTIVE_AGENT_WORK = new Set(["proposed", "approved", "in_progress", "blocked"]);

function unique(items: string[], limit = 12): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function normalizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function agentLabel(agent: string): string {
  return getAiosAgent(agent)?.name ?? agent;
}

function isEngineeringObjective(input: string, workspace: ExecutiveWorkspace): boolean {
  return (
    masonOwnsEngineeringTask(input) ||
    workspace.intelligence.workforceOptimization.recommendations.some(
      (rec) =>
        rec.recommendedOwner === ENGINEERING_OWNER ||
        rec.affectedAgents.includes(ENGINEERING_OWNER) ||
        rec.recommendedCollaborators.includes(ENGINEERING_OWNER),
    )
  );
}

function activeOsWork(work: OsWorkItem[]): OsWorkItem[] {
  return work.filter((item) => ACTIVE_OS_WORK.has(item.status));
}

function activeAgentWork(work: AgentWorkItem[]): AgentWorkItem[] {
  return work.filter((item) => ACTIVE_AGENT_WORK.has(item.status));
}

function blockerFromApproval(approval: Approval): AeoBlocker {
  return {
    id: `approval_${approval.id}`,
    kind: "approval",
    title: approval.title,
    detail: approval.summary ?? "Founder approval is required before this phase can continue.",
    owner: "Founder",
    resumeTrigger: "Approving the existing Review Queue item resumes the linked execution path.",
  };
}

function blockersFromState(input: {
  workspace: ExecutiveWorkspace;
  approvals: Approval[];
  osWork: OsWorkItem[];
  agentWork: AgentWorkItem[];
  masonRuntimePlan: MasonNativeRuntimePlan | null;
}): AeoBlocker[] {
  const blockedOsWork = input.osWork.filter((item) => item.status === "blocked");
  const blockedAgentWork = input.agentWork.filter((item) => item.status === "blocked");
  const productionBlockers = input.workspace.productionHealthSignals.filter(
    (signal) => /error|issue|unresolved/i.test(signal),
  );
  const connectorIssues = input.workspace.intelligence.metrics.connectorIssues;
  const masonBlocked =
    input.masonRuntimePlan?.blockedSteps.map((step) => ({
      id: `mason_${step.id}`,
      kind: "mason_boundary" as const,
      title: step.title,
      detail: step.summary,
      owner: "Mason",
      resumeTrigger: "Founder narrows scope or approves a safer branch/PR boundary.",
    })) ?? [];

  return [
    ...input.approvals.map(blockerFromApproval),
    ...blockedOsWork.slice(0, 4).map((item) => ({
      id: `os_work_${item.id}`,
      kind: "blocked_work" as const,
      title: item.title,
      detail: item.description ?? "Existing OS work is blocked.",
      owner: "Harmony",
      resumeTrigger: "Resolve or rerun the existing Harmony work item.",
    })),
    ...blockedAgentWork.slice(0, 4).map((item) => ({
      id: `agent_work_${item.id}`,
      kind: "blocked_work" as const,
      title: item.title,
      detail: item.detail ?? "Existing workforce queue item is blocked.",
      owner: agentLabel(item.agent),
      resumeTrigger: "Approve, delegate, or dismiss the existing workforce review item.",
    })),
    ...productionBlockers.slice(0, 3).map((signal, index) => ({
      id: `production_${index}`,
      kind: "production_health" as const,
      title: "Production health signal",
      detail: signal,
      owner: "Pulse",
      resumeTrigger: "Resolve the operational event through existing Operations visibility.",
    })),
    connectorIssues > 0
      ? {
          id: "connector_issues",
          kind: "connector" as const,
          title: "Connector issues need attention",
          detail: `${connectorIssues} connected service issue(s) may affect execution.`,
          owner: "Pulse",
          resumeTrigger: "Reconnect or repair the affected connector through existing settings.",
        }
      : null,
    ...masonBlocked,
  ].filter((blocker): blocker is AeoBlocker => Boolean(blocker));
}

function phaseStatus(input: {
  approvalRequired: boolean;
  hasPendingApproval: boolean;
  hasBlocker: boolean;
  activeWork: number;
}): AeoPhaseStatus {
  if (input.hasBlocker) return "blocked";
  if (input.hasPendingApproval || input.approvalRequired) return "paused_for_approval";
  if (input.activeWork > 0) return "in_progress";
  return "ready";
}

function phaseFromAdaptivePlan(
  phase: AdaptivePlanPhase,
  index: number,
  blockers: AeoBlocker[],
  activeWorkCount: number,
): AeoPhase {
  const dependencies = phase.dependencies.map(normalizeId);
  const dependencyBlockers = phase.dependencies.map((dependency) => ({
    id: `dependency_${phase.id}_${normalizeId(dependency)}`,
    kind: "dependency" as const,
    title: `Dependency: ${dependency}`,
    detail: "This phase should wait until the upstream dependency is resolved.",
    owner: agentLabel(phase.recommendedAgent),
    resumeTrigger: "Complete or clear the dependency in the existing execution path.",
  }));
  const approvalBlockers = blockers.filter((blocker) => blocker.kind === "approval").slice(0, 2);
  const phaseBlockers = [...dependencyBlockers, ...approvalBlockers];

  return {
    id: phase.id,
    title: phase.title,
    owner: phase.recommendedAgent,
    ownerLabel: agentLabel(phase.recommendedAgent),
    status: phaseStatus({
      approvalRequired: phase.approvalCheckpoint,
      hasPendingApproval: approvalBlockers.length > 0,
      hasBlocker: dependencyBlockers.length > 0,
      activeWork: activeWorkCount,
    }),
    order: index + 1,
    dependencies,
    approvalRequired: phase.approvalCheckpoint,
    blockers: phaseBlockers,
    summary: phase.summary,
  };
}

function fallbackPhases(input: {
  objective: string;
  engineering: boolean;
  blockers: AeoBlocker[];
  activeWorkCount: number;
}): AeoPhase[] {
  const owners = input.engineering
    ? ([ENGINEERING_OWNER, "auditor", "pulse"] satisfies AiosAgentKey[])
    : NON_ENGINEERING_SEQUENCE;
  const templates = input.engineering
    ? [
        "Classify engineering scope and safe Mason boundary.",
        "Plan branch, implementation, tests, preview, and Founder approval gates.",
        "Validate checks, deployment health, and release readiness.",
      ]
    : [
        "Confirm the Founder objective and current operating context.",
        "Retrieve Julius memory, Company Skills, and OIE execution patterns.",
        "Route work to the existing AIOS workforce and review queue.",
        "Monitor outcomes and capture execution history through Activity Events.",
      ];

  return templates.map((summary, index) => {
    const approvalBlockers = input.blockers.filter((blocker) => blocker.kind === "approval").slice(0, 2);
    const hasBlocker = index === 0 && input.blockers.some((blocker) => blocker.kind !== "approval");
    return {
      id: `phase_${index + 1}`,
      title: index === 0 ? "Intake and sequencing" : index === templates.length - 1 ? "Validation and reporting" : "Execution coordination",
      owner: owners[index] ?? DEFAULT_WORKFORCE_OWNER,
      ownerLabel: agentLabel(owners[index] ?? DEFAULT_WORKFORCE_OWNER),
      status: phaseStatus({
        approvalRequired: approvalBlockers.length > 0 && index <= 1,
        hasPendingApproval: approvalBlockers.length > 0 && index <= 1,
        hasBlocker,
        activeWork: input.activeWorkCount,
      }),
      order: index + 1,
      dependencies: index === 0 ? [] : [`phase_${index}`],
      approvalRequired: approvalBlockers.length > 0 && index <= 1,
      blockers: index <= 1 ? approvalBlockers : [],
      summary,
    };
  });
}

function executionStatus(phases: AeoPhase[], blockers: AeoBlocker[]): AeoPhaseStatus {
  if (blockers.some((blocker) => blocker.kind !== "approval")) return "blocked";
  if (blockers.some((blocker) => blocker.kind === "approval")) return "paused_for_approval";
  if (phases.some((phase) => phase.status === "in_progress")) return "in_progress";
  if (phases.every((phase) => phase.status === "complete")) return "complete";
  return "ready";
}

function nextAction(status: AeoPhaseStatus, phases: AeoPhase[], blockers: AeoBlocker[]): string {
  const firstBlocker = blockers[0];
  if (firstBlocker) return `${firstBlocker.owner}: ${firstBlocker.resumeTrigger}`;
  const nextPhase = phases.find((phase) => phase.status === "ready" || phase.status === "in_progress") ?? phases[0];
  if (status === "ready") return `Start ${nextPhase?.title ?? "the first phase"} with ${nextPhase?.ownerLabel ?? "Harmony"}.`;
  if (status === "in_progress") return `Continue ${nextPhase?.title ?? "the active phase"} and report progress through Harmony.`;
  if (status === "complete") return "Summarize execution history and capture lessons in existing memory and skills.";
  return "Review the existing approval or blocker before execution continues.";
}

function estimatedCompletion(phases: AeoPhase[], blockers: AeoBlocker[]): string {
  if (blockers.some((blocker) => blocker.kind === "approval")) return "Paused until Founder approval is decided.";
  if (blockers.length > 0) return "Blocked until the listed dependency or operational issue is resolved.";
  const active = phases.filter((phase) => phase.status !== "complete").length;
  if (active <= 2) return "Short sequence after current context is confirmed.";
  if (active <= 4) return "Medium sequence with staged validation.";
  return "Longer sequence with multiple workforce handoffs.";
}

function confidence(workspace: ExecutiveWorkspace, blockers: AeoBlocker[]): "high" | "medium" | "low" {
  if (blockers.some((blocker) => blocker.kind === "production_health" || blocker.kind === "mason_boundary")) return "low";
  if (workspace.snapshot.confidenceLevel === "high" && blockers.length === 0) return "high";
  if (workspace.snapshot.confidenceLevel === "low") return "low";
  return "medium";
}

function affectedDepartments(phases: AeoPhase[], engineering: boolean): string[] {
  const names = phases.map((phase) => {
    if (phase.owner === "mason") return "Engineering (Mason)";
    if (phase.owner === "ledger" || phase.approvalRequired) return "Operations";
    if (phase.owner === "ambassador") return "Customer Success";
    if (phase.owner === "catalyst") return "Marketing";
    if (phase.owner === "pulse") return "Operations";
    if (phase.owner === "horizon") return "Executive";
    return "AI Workforce";
  });
  return unique([engineering ? "Engineering (Mason)" : "", "Executive", ...names], 8);
}

export function formatAeoContextForHarmony(plan: AeoOrchestrationPlan): string {
  return [
    "Autonomous Execution Orchestrator Context",
    `Objective: ${plan.objective}`,
    `Status: ${plan.status}`,
    `Confidence: ${plan.confidence}`,
    `Estimated completion: ${plan.estimatedCompletion}`,
    `Affected departments: ${plan.affectedDepartments.join(", ")}`,
    `Next recommended action: ${plan.nextRecommendedAction}`,
    `Execution order:\n${plan.executionOrder.map((phase) => `- ${phase}`).join("\n")}`,
    plan.blockers.length
      ? `Blocked or paused phases:\n${plan.blockers.map((blocker) => `- ${blocker.title}: ${blocker.detail}`).join("\n")}`
      : "Blocked or paused phases: none",
    plan.masonRuntimePlan
      ? `Mason routing: ${plan.masonRuntimePlan.boundarySummary}`
      : "Mason routing: no engineering-owned phase detected.",
    "Use this orchestration context before launching major execution. Do not create parallel state; use the existing work queue, review queue, approvals, Activity Events, Julius, Company Skills, OIE, and Mason runtime boundaries.",
  ].join("\n\n");
}

export async function buildAutonomousExecutionOrchestration(input: {
  userId: string;
  companyId: string | null;
  objective: string;
}): Promise<AeoOrchestrationPlan> {
  const [workspace, objectives, osWork, agentWork, approvals] = await Promise.all([
    buildExecutiveWorkspace(input.userId, input.companyId),
    listObjectives(input.userId, { companyId: input.companyId, status: "active", limit: 50 }),
    input.companyId ? listOsWorkItems({ companyId: input.companyId }) : Promise.resolve([]),
    listAgentWorkItems(input.userId, { companyId: input.companyId, limit: 100 }),
    listApprovals({ companyId: input.companyId ?? undefined, status: "pending" }),
  ]);

  return buildAeoPlanFromState({
    userId: input.userId,
    companyId: input.companyId,
    objective: input.objective,
    workspace,
    objectives,
    osWork,
    agentWork,
    approvals,
  });
}

export function buildAeoPlanFromState(input: {
  userId: string;
  companyId: string | null;
  objective: string;
  workspace: ExecutiveWorkspace;
  objectives: AgentObjective[];
  osWork: OsWorkItem[];
  agentWork: AgentWorkItem[];
  approvals: Approval[];
}): AeoOrchestrationPlan {
  const activeObjectives = input.objectives;
  const liveOsWork = activeOsWork(input.osWork);
  const liveAgentWork = activeAgentWork(input.agentWork);
  const objectiveText = [
    input.objective,
    input.workspace.intelligence.planning.current?.objective ?? "",
    ...activeObjectives.slice(0, 5).map((objective) => objective.title),
  ].join("\n");
  const engineering = isEngineeringObjective(objectiveText, input.workspace);
  const masonRuntimePlan = engineering
    ? createMasonNativeRuntimePlan({
        objective: input.objective,
        detail: input.workspace.intelligence.planning.current?.executiveSummary,
        repository: "AIOS-HQ/aios-platform",
      })
    : null;
  const blockers = blockersFromState({
    workspace: input.workspace,
    approvals: input.approvals,
    osWork: liveOsWork,
    agentWork: liveAgentWork,
    masonRuntimePlan,
  });
  const adaptivePlan: AdaptiveExecutionPlan | null = input.workspace.intelligence.planning.current;
  const activeWorkCount = liveOsWork.length + liveAgentWork.length;
  const phases = adaptivePlan?.phases.length
    ? adaptivePlan.phases.map((phase, index) => phaseFromAdaptivePlan(phase, index, blockers, activeWorkCount))
    : fallbackPhases({
        objective: input.objective,
        engineering,
        blockers,
        activeWorkCount,
      });
  const status = executionStatus(phases, blockers);
  const plan: AeoOrchestrationPlan = {
    generatedAt: new Date().toISOString(),
    userId: input.userId,
    companyId: input.companyId,
    objective: input.objective,
    status,
    executionOrder: phases
      .sort((a, b) => a.order - b.order)
      .map((phase) => `${phase.order}. ${phase.title} (${phase.ownerLabel})`),
    phases,
    blockers,
    nextRecommendedAction: nextAction(status, phases, blockers),
    estimatedCompletion: estimatedCompletion(phases, blockers),
    confidence: confidence(input.workspace, blockers),
    affectedDepartments: affectedDepartments(phases, engineering),
    masonRuntimePlan,
    executiveWorkspace: input.workspace,
    promptContext: "",
  };
  plan.promptContext = formatAeoContextForHarmony(plan);
  return plan;
}

export async function recordAeoLaunchContext(plan: AeoOrchestrationPlan): Promise<void> {
  await emitActivity({
    userId: plan.userId,
    companyId: plan.companyId,
    actorType: "agent",
    actorId: "harmony",
    kind: "system",
    summary: `AEO prepared ${plan.phases.length} phase(s) for: ${plan.objective}`,
    refType: "autonomous_execution_orchestrator",
    refId: null,
  });
}

export function isMajorExecutionSequence(input: string): boolean {
  const text = input.toLowerCase();
  return /execute|launch|implement|coordinate|orchestrate|ship|deploy|roll out|run|build|release|sequence|workflow|objective|repo:|business:|company:|harmony:/.test(
    text,
  );
}
