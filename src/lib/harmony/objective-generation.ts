import "server-only";

import type { AuditFinding } from "@/lib/agents/auditor/service";
import type { AdaptiveExecutionPlan } from "@/lib/harmony/adaptive-planning";
import { masonOwnsEngineeringTask } from "@/lib/harmony/code/mason";
import { emitActivity } from "@/lib/harmony/os/events";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";
import type { CompanySkill } from "@/lib/company-skills/library";
import {
  createObjective,
  type AgentObjective,
  type ObjectivePriority,
} from "@/lib/workforce/objectives";
import type { WorkItem } from "@/lib/workforce/work-queue";
import type { AiosAgentKey } from "@/lib/workforce/registry";

export type ObjectiveOpportunityKind =
  | "technical_debt"
  | "repeated_failure"
  | "recurring_bottleneck"
  | "documentation_gap"
  | "security_improvement"
  | "performance_improvement"
  | "architecture_improvement"
  | "automation_opportunity"
  | "engineering_opportunity"
  | "business_opportunity"
  | "workforce_opportunity"
  | "customer_experience"
  | "operational_improvement";

export interface GeneratedObjectiveProposal {
  title: string;
  description: string;
  businessReason: string;
  expectedImpact: string;
  estimatedEffort: "low" | "medium" | "high";
  confidence: number;
  priority: ObjectivePriority;
  recommendedOwner: AiosAgentKey;
  recommendedCollaborators: AiosAgentKey[];
  companySkillsUsed: string[];
  organizationalSignals: string[];
  adaptivePlanningSummary: string;
  approvalRequirement: "recommended" | "required";
  kind: ObjectiveOpportunityKind;
  sourceId: string;
}

interface GenerationInput {
  auditFindings: AuditFinding[];
  work: WorkItem[];
  objectives: AgentObjective[];
  companySkills: CompanySkill[];
  organization: OrganizationalIntelligence;
  adaptivePlan: AdaptiveExecutionPlan | null;
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ownerFor(text: string, fallback: AiosAgentKey = "harmony"): AiosAgentKey {
  const n = normalize(text);
  if (masonOwnsEngineeringTask(text)) return "mason";
  if (/security|risk|credential|token|permission|auth/.test(n)) return "aegis";
  if (/approval|record|compliance|audit trail|finance|payment/.test(n)) return "ledger";
  if (/connector|deployment|monitor|health|incident|operations|uptime/.test(n)) return "pulse";
  if (/content|growth|campaign|seo|publish/.test(n)) return "catalyst";
  if (/customer|support|message|communication|experience/.test(n)) return "ambassador";
  if (/memory|julius|documentation|knowledge/.test(n)) return "atlas";
  if (/strategy|roadmap|market|business|opportunity/.test(n)) return "horizon";
  return fallback;
}

function priorityFor(score: number): ObjectivePriority {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function effortFor(text: string, priority: ObjectivePriority): GeneratedObjectiveProposal["estimatedEffort"] {
  const n = normalize(text);
  if (/architecture|migration|platform|security|database|infrastructure|refactor/.test(n)) return "high";
  if (priority === "high" || /integration|automation|workflow|documentation/.test(n)) return "medium";
  return "low";
}

function collaboratorsFor(owner: AiosAgentKey, text: string): AiosAgentKey[] {
  const collaborators = new Set<AiosAgentKey>(["harmony"]);
  const n = normalize(text);
  if (owner === "mason" || /code|api|database|deployment|performance|architecture/.test(n)) {
    collaborators.add("auditor");
    collaborators.add("pulse");
  }
  if (/security|risk|approval|credential|token/.test(n)) collaborators.add("aegis");
  if (/documentation|memory|julius|knowledge/.test(n)) collaborators.add("atlas");
  if (/customer|support|communication/.test(n)) collaborators.add("ambassador");
  if (/business|strategy|market|roadmap/.test(n)) collaborators.add("horizon");
  collaborators.delete(owner);
  return [...collaborators].slice(0, 4);
}

function skillTitles(skills: CompanySkill[], query: string): string[] {
  const q = normalize(query);
  return skills
    .filter((skill) => {
      const haystack = normalize(`${skill.title} ${skill.category} ${skill.summary} ${skill.reusable_solution}`);
      return q.split(" ").some((term) => term.length > 3 && haystack.includes(term));
    })
    .sort((a, b) => b.confidence_score - a.confidence_score || b.success_count - a.success_count)
    .slice(0, 3)
    .map((skill) => skill.title);
}

function proposal(input: {
  title: string;
  description: string;
  businessReason: string;
  expectedImpact: string;
  score: number;
  kind: ObjectiveOpportunityKind;
  sourceId: string;
  skills: CompanySkill[];
  organization: OrganizationalIntelligence;
  adaptivePlan: AdaptiveExecutionPlan | null;
}): GeneratedObjectiveProposal {
  const owner = ownerFor(`${input.title} ${input.description}`);
  const priority = priorityFor(input.score);
  const text = `${input.title} ${input.description}`;
  return {
    title: input.title.slice(0, 140),
    description: input.description,
    businessReason: input.businessReason,
    expectedImpact: input.expectedImpact,
    estimatedEffort: effortFor(text, priority),
    confidence: Math.max(35, Math.min(95, Math.round(input.score))),
    priority,
    recommendedOwner: owner,
    recommendedCollaborators: collaboratorsFor(owner, text),
    companySkillsUsed: skillTitles(input.skills, text),
    organizationalSignals: [
      input.organization.strongestCollaboration
        ? `Strongest collaboration: ${input.organization.strongestCollaboration.label}`
        : null,
      input.organization.bottlenecks[0]
        ? `Top bottleneck: ${input.organization.bottlenecks[0].title}`
        : null,
      input.organization.mostEffectivePattern
        ? `Effective pattern: ${input.organization.mostEffectivePattern.title}`
        : null,
    ].filter((signal): signal is string => Boolean(signal)),
    adaptivePlanningSummary: input.adaptivePlan?.executiveSummary ?? "Adaptive Planning will be generated after approval.",
    approvalRequirement: priority === "high" || /security|production|database|payment|credential|token/.test(normalize(text))
      ? "required"
      : "recommended",
    kind: input.kind,
    sourceId: input.sourceId,
  };
}

function proposalDetail(p: GeneratedObjectiveProposal): string {
  return [
    p.description,
    "",
    `Business reason: ${p.businessReason}`,
    `Expected impact: ${p.expectedImpact}`,
    `Estimated effort: ${p.estimatedEffort}`,
    `Confidence: ${p.confidence}/100`,
    `Priority: ${p.priority}`,
    `Recommended owner: ${p.recommendedOwner}`,
    `Recommended collaborators: ${p.recommendedCollaborators.join(", ") || "None"}`,
    `Company Skills used: ${p.companySkillsUsed.join(", ") || "No directly matched skills yet"}`,
    `Organizational Intelligence signals: ${p.organizationalSignals.join(" | ") || "No stable OIE signal yet"}`,
    `Adaptive Planning summary: ${p.adaptivePlanningSummary}`,
    `Approval requirement: ${p.approvalRequirement}`,
    `Generated by Harmony objective generation from ${p.kind}:${p.sourceId}`,
  ].join("\n");
}

function alreadyExists(existing: AgentObjective[], title: string): boolean {
  const target = normalize(title);
  return existing.some((objective) => {
    if (objective.status === "done" || objective.status === "dismissed") return false;
    const current = normalize(objective.title);
    return current === target || current.includes(target) || target.includes(current);
  });
}

export function generateObjectiveProposals(input: GenerationInput): GeneratedObjectiveProposal[] {
  const proposals: GeneratedObjectiveProposal[] = [];

  for (const finding of input.auditFindings.filter((finding) => finding.severity !== "ok").slice(0, 8)) {
    const text = `${finding.title} ${finding.detail} ${finding.domain}`;
    const kind: ObjectiveOpportunityKind =
      /security|risk|credential|token|permission/.test(normalize(text))
        ? "security_improvement"
        : /performance|slow|latency/.test(normalize(text))
          ? "performance_improvement"
          : /documentation|docs|runbook/.test(normalize(text))
            ? "documentation_gap"
            : masonOwnsEngineeringTask(text)
              ? "engineering_opportunity"
              : "operational_improvement";
    proposals.push(proposal({
      title: `Resolve ${finding.title}`,
      description: finding.detail,
      businessReason: `Auditor identified a ${finding.severity} signal in ${finding.domain}.`,
      expectedImpact: "Reduce operational risk and improve execution reliability.",
      score: finding.severity === "risk" ? 88 : finding.severity === "warn" ? 68 : 45,
      kind,
      sourceId: `${finding.domain}:${finding.title}`,
      skills: input.companySkills,
      organization: input.organization,
      adaptivePlan: input.adaptivePlan,
    }));
  }

  for (const bottleneck of input.organization.bottlenecks.slice(0, 3)) {
    proposals.push(proposal({
      title: `Reduce bottleneck: ${bottleneck.title}`,
      description: bottleneck.recommendation,
      businessReason: `${bottleneck.count} recurring operational signal(s) indicate this slows AIOS execution.`,
      expectedImpact: "Improve throughput, reduce repeated blockers, and increase workforce reliability.",
      score: bottleneck.severity === "high" ? 84 : bottleneck.severity === "medium" ? 66 : 48,
      kind: "recurring_bottleneck",
      sourceId: bottleneck.id,
      skills: input.companySkills,
      organization: input.organization,
      adaptivePlan: input.adaptivePlan,
    }));
  }

  for (const work of input.work.filter((item) => item.status === "blocked").slice(0, 4)) {
    proposals.push(proposal({
      title: `Unblock recurring work: ${work.title}`,
      description: work.detail ?? `Resolve the blocked work item owned by ${work.agent}.`,
      businessReason: "Blocked work represents unresolved execution risk.",
      expectedImpact: "Move stalled work back into execution and preserve delivery momentum.",
      score: work.risk === "destructive" || work.risk_level === "critical" ? 86 : 70,
      kind: "repeated_failure",
      sourceId: work.id,
      skills: input.companySkills,
      organization: input.organization,
      adaptivePlan: input.adaptivePlan,
    }));
  }

  for (const skill of input.companySkills.filter((skill) => skill.confidence_score >= 75 && skill.success_count >= 2).slice(0, 3)) {
    proposals.push(proposal({
      title: `Apply proven skill: ${skill.title}`,
      description: skill.reusable_solution || skill.summary,
      businessReason: `AIOS has reused this skill successfully ${skill.success_count} time(s).`,
      expectedImpact: "Turn accumulated knowledge into new operational leverage.",
      score: Math.min(82, skill.confidence_score + skill.success_count),
      kind: "automation_opportunity",
      sourceId: skill.id,
      skills: input.companySkills,
      organization: input.organization,
      adaptivePlan: input.adaptivePlan,
    }));
  }

  return proposals
    .filter((p) => !alreadyExists(input.objectives, p.title))
    .sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title))
    .slice(0, 5);
}

export async function ensureAutonomousObjectiveProposals(params: {
  userId: string;
  companyId: string | null;
  proposals: GeneratedObjectiveProposal[];
  existingObjectives: AgentObjective[];
  limit?: number;
}): Promise<AgentObjective[]> {
  if (!params.companyId) return [];
  const created: AgentObjective[] = [];
  const existing = [...params.existingObjectives];
  for (const p of params.proposals.slice(0, params.limit ?? 3)) {
    if (alreadyExists(existing, p.title)) continue;
    const objective = await createObjective({
      userId: params.userId,
      companyId: params.companyId,
      agent: p.recommendedOwner,
      title: p.title,
      detail: proposalDetail(p),
      priority: p.priority,
      origin: "agent",
    });
    if (!objective) continue;
    created.push(objective);
    existing.push(objective);
    await emitActivity({
      userId: params.userId,
      companyId: params.companyId,
      actorType: "agent",
      actorId: "harmony",
      kind: "recommendation",
      summary: `Harmony proposed objective: ${p.title}`.slice(0, 280),
      refType: "agent_objective",
      refId: objective.id,
    }).catch(() => {});
  }
  return created;
}
