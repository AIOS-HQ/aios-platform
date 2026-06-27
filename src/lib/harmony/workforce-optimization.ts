import { masonOwnsEngineeringTask } from "@/lib/harmony/code/mason";
import {
  AIOS_WORKFORCE,
  getAiosAgent,
  type AiosAgentKey,
} from "@/lib/workforce/registry";
import type { AdaptiveExecutionPlan } from "@/lib/harmony/adaptive-planning";
import type { CompanySkill } from "@/lib/company-skills/library";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";
import type { AgentObjective } from "@/lib/workforce/objectives";
import type { WorkItem } from "@/lib/workforce/work-queue";

export type WorkforceOptimizationKind =
  | "rebalance_workload"
  | "route_to_mason"
  | "resolve_bottleneck"
  | "reuse_high_performing_collaboration"
  | "avoid_unreliable_collaboration"
  | "reduce_approval_blocker"
  | "improve_execution_sequence"
  | "adjust_autonomy";

export type WorkforceOptimizationRisk = "low" | "medium" | "high";

export interface WorkforceOptimizationRecommendation {
  id: string;
  kind: WorkforceOptimizationKind;
  title: string;
  reason: string;
  affectedAgents: AiosAgentKey[];
  affectedObjectiveOrWorkType: string;
  recommendedOwner: AiosAgentKey;
  recommendedCollaborators: AiosAgentKey[];
  confidence: number;
  expectedImpact: string;
  riskLevel: WorkforceOptimizationRisk;
  suggestedAction: string;
  founderApprovalRequired: boolean;
  companySkillsUsed: string[];
  organizationalSignals: string[];
}

export interface WorkforceOptimizationSummary {
  generatedAt: string;
  recommendations: WorkforceOptimizationRecommendation[];
  strongestOpportunity: WorkforceOptimizationRecommendation | null;
  overloadedAgents: AiosAgentKey[];
  underusedAgents: AiosAgentKey[];
  highPerformingCollaboration: {
    agents: AiosAgentKey[];
    label: string;
    reliability: number;
    completed: number;
  } | null;
}

export interface WorkforceOptimizationInput {
  work: WorkItem[];
  objectives: AgentObjective[];
  companySkills: CompanySkill[];
  organization: OrganizationalIntelligence;
  adaptivePlan: AdaptiveExecutionPlan | null;
}

const ACTIVE_WORK = new Set(["proposed", "approved", "in_progress"]);
const OPEN_OBJECTIVES = new Set(["proposed", "active"]);
const MASON_ENGINEERING_WORK = "engineering/software/code/app/website/API/database/infrastructure";

const RISK_SCORE: Record<WorkforceOptimizationRisk, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampConfidence(value: number): number {
  return Math.max(25, Math.min(95, Math.round(value)));
}

function asAgentKey(agent: string | null | undefined): AiosAgentKey | null {
  const key = getAiosAgent(agent ?? "")?.key;
  return key ?? null;
}

function uniqueAgents(agents: Array<string | null | undefined>): AiosAgentKey[] {
  return [...new Set(agents.map(asAgentKey).filter((agent): agent is AiosAgentKey => Boolean(agent)))];
}

function skillTitlesForAgents(skills: CompanySkill[], agents: AiosAgentKey[], limit = 3): string[] {
  return skills
    .filter((skill) => agents.includes(skill.owner_agent as AiosAgentKey))
    .sort(
      (a, b) =>
        b.confidence_score - a.confidence_score ||
        b.success_count - a.success_count ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit)
    .map((skill) => skill.title);
}

function workloadMaps(work: WorkItem[], objectives: AgentObjective[]) {
  const active = new Map<AiosAgentKey, number>();
  const blocked = new Map<AiosAgentKey, number>();

  for (const item of work) {
    const agent = asAgentKey(item.agent);
    if (!agent) continue;
    if (ACTIVE_WORK.has(item.status)) active.set(agent, (active.get(agent) ?? 0) + 1);
    if (item.status === "blocked") blocked.set(agent, (blocked.get(agent) ?? 0) + 1);
  }

  for (const objective of objectives) {
    const agent = asAgentKey(objective.agent);
    if (!agent) continue;
    if (OPEN_OBJECTIVES.has(objective.status)) active.set(agent, (active.get(agent) ?? 0) + 1);
  }

  return { active, blocked };
}

function recommendation(
  rec: Omit<WorkforceOptimizationRecommendation, "id" | "confidence"> & {
    id: string;
    confidence: number;
  },
): WorkforceOptimizationRecommendation {
  return {
    ...rec,
    confidence: clampConfidence(rec.confidence),
    recommendedCollaborators: rec.recommendedCollaborators.filter(
      (agent, index, agents) => agents.indexOf(agent) === index && agent !== rec.recommendedOwner,
    ),
    affectedAgents: rec.affectedAgents.filter((agent, index, agents) => agents.indexOf(agent) === index),
  };
}

function sortRecommendations(
  recommendations: WorkforceOptimizationRecommendation[],
): WorkforceOptimizationRecommendation[] {
  return recommendations
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        RISK_SCORE[b.riskLevel] - RISK_SCORE[a.riskLevel] ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 8);
}

export function buildWorkforceOptimization(
  input: WorkforceOptimizationInput,
): WorkforceOptimizationSummary {
  const { active, blocked } = workloadMaps(input.work, input.objectives);
  const overloadedAgents = AIOS_WORKFORCE.map((agent) => agent.key).filter(
    (agent) => (active.get(agent) ?? 0) >= 4 || (blocked.get(agent) ?? 0) >= 2,
  );
  const underusedAgents = AIOS_WORKFORCE.map((agent) => agent.key).filter(
    (agent) => agent !== "harmony" && (active.get(agent) ?? 0) === 0 && (blocked.get(agent) ?? 0) === 0,
  );
  const recommendations: WorkforceOptimizationRecommendation[] = [];

  for (const agent of overloadedAgents.slice(0, 3)) {
    const collaborators = underusedAgents.filter((candidate) => candidate !== "mason").slice(0, 3);
    recommendations.push(
      recommendation({
        id: `rebalance-${agent}`,
        kind: "rebalance_workload",
        title: `Rebalance ${getAiosAgent(agent)?.name ?? agent} workload`,
        reason: `${getAiosAgent(agent)?.name ?? agent} has ${active.get(agent) ?? 0} active item(s) and ${blocked.get(agent) ?? 0} blocked item(s).`,
        affectedAgents: [agent, ...collaborators],
        affectedObjectiveOrWorkType: "active workforce load",
        recommendedOwner: "harmony",
        recommendedCollaborators: collaborators,
        confidence: 72 + (blocked.get(agent) ?? 0) * 6,
        expectedImpact: "Reduce queue pressure and improve execution reliability before new work is assigned.",
        riskLevel: "medium",
        suggestedAction: "Review open work and reassign low-risk follow-up items to available specialists.",
        founderApprovalRequired: true,
        companySkillsUsed: skillTitlesForAgents(input.companySkills, [agent, ...collaborators]),
        organizationalSignals: [
          `${active.get(agent) ?? 0} active item(s)`,
          `${blocked.get(agent) ?? 0} blocked item(s)`,
        ],
      }),
    );
  }

  const engineeringCandidates = [
    ...input.objectives
      .filter((objective) => OPEN_OBJECTIVES.has(objective.status))
      .map((objective) => ({
        id: objective.id,
        owner: objective.agent,
        title: objective.title,
        detail: objective.detail,
      })),
    ...input.work
      .filter((item) => ACTIVE_WORK.has(item.status))
      .map((item) => ({
        id: item.id,
        owner: item.agent,
        title: item.title,
        detail: item.detail,
      })),
  ].filter((item) => item.owner !== "mason" && masonOwnsEngineeringTask(`${item.title}\n${item.detail ?? ""}`));

  if (engineeringCandidates[0]) {
    const candidate = engineeringCandidates[0];
    recommendations.push(
      recommendation({
        id: `route-mason-${normalize(candidate.id)}`,
        kind: "route_to_mason",
        title: "Route engineering work to Mason",
        reason: `${candidate.title} matches Mason's Founder-native engineering scope but is currently owned by ${getAiosAgent(candidate.owner)?.name ?? candidate.owner}.`,
        affectedAgents: uniqueAgents([candidate.owner, "mason"]),
        affectedObjectiveOrWorkType: MASON_ENGINEERING_WORK,
        recommendedOwner: "mason",
        recommendedCollaborators: ["auditor", "pulse"],
        confidence: 88,
        expectedImpact: "Improve software delivery quality by using Mason's branch, test, PR, preview, and Founder approval boundary.",
        riskLevel: "medium",
        suggestedAction: "Move the engineering execution plan to Mason while keeping review and merge approval with the Founder.",
        founderApprovalRequired: true,
        companySkillsUsed: skillTitlesForAgents(input.companySkills, ["mason", "auditor", "pulse"]),
        organizationalSignals: ["Mason owns engineering execution boundaries"],
      }),
    );
  }

  for (const bottleneck of input.organization.bottlenecks.slice(0, 2)) {
    const agents = uniqueAgents(bottleneck.agents);
    recommendations.push(
      recommendation({
        id: `bottleneck-${normalize(bottleneck.id)}`,
        kind: "resolve_bottleneck",
        title: `Resolve ${bottleneck.title}`,
        reason: `${bottleneck.title} appeared across ${bottleneck.count} operational signal(s).`,
        affectedAgents: agents,
        affectedObjectiveOrWorkType: bottleneck.id,
        recommendedOwner: agents[0] ?? "harmony",
        recommendedCollaborators: agents.slice(1),
        confidence: bottleneck.severity === "high" ? 84 : 68,
        expectedImpact: "Reduce repeat blockers before they affect additional objectives.",
        riskLevel: bottleneck.severity === "high" ? "high" : "medium",
        suggestedAction: bottleneck.recommendation,
        founderApprovalRequired: bottleneck.severity !== "low",
        companySkillsUsed: skillTitlesForAgents(input.companySkills, agents),
        organizationalSignals: [`${bottleneck.count} ${bottleneck.severity} bottleneck signal(s)`],
      }),
    );
  }

  const highPerforming =
    input.organization.highestPerformingCollaboration ?? input.organization.strongestCollaboration;
  if (highPerforming && highPerforming.completed > 0 && highPerforming.reliability >= 70) {
    const agents = uniqueAgents(highPerforming.agents);
    recommendations.push(
      recommendation({
        id: `reuse-collaboration-${normalize(highPerforming.id)}`,
        kind: "reuse_high_performing_collaboration",
        title: `Reuse ${highPerforming.label}`,
        reason: `${highPerforming.label} has ${highPerforming.reliability}% reliability across ${highPerforming.completed} completed collaboration(s).`,
        affectedAgents: agents,
        affectedObjectiveOrWorkType: "collaboration pattern",
        recommendedOwner: agents[0] ?? "harmony",
        recommendedCollaborators: agents.slice(1),
        confidence: highPerforming.reliability,
        expectedImpact: "Increase planning quality by reusing a proven workforce collaboration pattern.",
        riskLevel: "low",
        suggestedAction: "Prefer this collaboration pattern for similar objectives before assigning unproven combinations.",
        founderApprovalRequired: false,
        companySkillsUsed: skillTitlesForAgents(input.companySkills, agents),
        organizationalSignals: [
          `${highPerforming.completed} completed collaboration(s)`,
          `${highPerforming.reliability}% reliability`,
        ],
      }),
    );
  }

  const unreliable = input.organization.collaborations.find(
    (collaboration) => collaboration.total >= 2 && collaboration.reliability < 50,
  );
  if (unreliable) {
    const agents = uniqueAgents(unreliable.agents);
    recommendations.push(
      recommendation({
        id: `avoid-collaboration-${normalize(unreliable.id)}`,
        kind: "avoid_unreliable_collaboration",
        title: `Review ${unreliable.label} collaboration`,
        reason: `${unreliable.label} has ${unreliable.reliability}% reliability with ${unreliable.blocked} blocked event(s).`,
        affectedAgents: agents,
        affectedObjectiveOrWorkType: "collaboration pattern",
        recommendedOwner: "harmony",
        recommendedCollaborators: agents,
        confidence: 78,
        expectedImpact: "Avoid repeating collaboration patterns that have created blocked work.",
        riskLevel: "medium",
        suggestedAction: "Use a different execution sequence or add a validation owner before delegating similar work.",
        founderApprovalRequired: true,
        companySkillsUsed: skillTitlesForAgents(input.companySkills, agents),
        organizationalSignals: [
          `${unreliable.blocked} blocked collaboration event(s)`,
          `${unreliable.reliability}% reliability`,
        ],
      }),
    );
  }

  if (input.organization.metrics.approvalFrequency >= 30) {
    recommendations.push(
      recommendation({
        id: "approval-frequency",
        kind: "reduce_approval_blocker",
        title: "Reduce recurring approval blockers",
        reason: `Approval frequency is ${input.organization.metrics.approvalFrequency}% across recent execution history.`,
        affectedAgents: ["harmony", "ledger"],
        affectedObjectiveOrWorkType: "approval workflow",
        recommendedOwner: "ledger",
        recommendedCollaborators: ["harmony", "aegis"],
        confidence: input.organization.metrics.approvalFrequency + 35,
        expectedImpact: "Separate routine approval patterns from genuinely high-risk Founder review.",
        riskLevel: "high",
        suggestedAction: "Review approval rules and propose safe autonomy adjustments for repeat low-risk work.",
        founderApprovalRequired: true,
        companySkillsUsed: skillTitlesForAgents(input.companySkills, ["ledger", "harmony", "aegis"]),
        organizationalSignals: [`${input.organization.metrics.approvalFrequency}% approval frequency`],
      }),
    );
  }

  if (input.adaptivePlan && input.adaptivePlan.phases.length >= 4) {
    const agents = uniqueAgents(input.adaptivePlan.recommendedWorkforce);
    recommendations.push(
      recommendation({
        id: `sequence-${normalize(input.adaptivePlan.objective)}`,
        kind: "improve_execution_sequence",
        title: "Use adaptive execution sequence",
        reason: `${input.adaptivePlan.objective} has a ${input.adaptivePlan.confidence}% confidence plan with ${input.adaptivePlan.phases.length} phase(s).`,
        affectedAgents: agents,
        affectedObjectiveOrWorkType: input.adaptivePlan.objective,
        recommendedOwner: agents[0] ?? "harmony",
        recommendedCollaborators: agents.slice(1),
        confidence: input.adaptivePlan.confidence,
        expectedImpact: "Improve execution predictability by following the planned agent sequence and checkpoints.",
        riskLevel: input.adaptivePlan.approvalCheckpoints.length > 0 ? "medium" : "low",
        suggestedAction: "Use the adaptive plan sequence before generating additional work items.",
        founderApprovalRequired: input.adaptivePlan.approvalCheckpoints.length > 0,
        companySkillsUsed: input.adaptivePlan.relevantSkills.map((skill) => skill.title).slice(0, 4),
        organizationalSignals: [
          `${input.adaptivePlan.phases.length} planned phase(s)`,
          `${input.adaptivePlan.approvalCheckpoints.length} approval checkpoint(s)`,
        ],
      }),
    );
  }

  const sorted = sortRecommendations(recommendations);
  const collaborationAgents = highPerforming ? uniqueAgents(highPerforming.agents) : [];

  return {
    generatedAt: new Date().toISOString(),
    recommendations: sorted,
    strongestOpportunity: sorted[0] ?? null,
    overloadedAgents,
    underusedAgents,
    highPerformingCollaboration: highPerforming
      ? {
          agents: collaborationAgents,
          label: highPerforming.label,
          reliability: highPerforming.reliability,
          completed: highPerforming.completed,
        }
      : null,
  };
}
