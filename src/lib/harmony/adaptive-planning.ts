import "server-only";

import {
  consultCompanySkills,
  formatSkillContext,
  type SkillUsageEvidence,
} from "@/lib/company-skills/utilization";
import {
  buildOrganizationalIntelligence,
  formatOrganizationalContext,
  type OrganizationalIntelligence,
} from "@/lib/organizational-intelligence/engine";
import {
  AIOS_WORKFORCE,
  WORKFORCE_SPECIALISTS,
  getAiosAgent,
  type AiosAgentKey,
} from "@/lib/workforce/registry";

export type AdaptivePlanEffort = "low" | "medium" | "high";

export interface AdaptivePlanPhase {
  id: string;
  title: string;
  summary: string;
  recommendedAgent: AiosAgentKey;
  dependencies: string[];
  approvalCheckpoint: boolean;
  estimatedEffort: AdaptivePlanEffort;
  confidence: number;
  skills: SkillUsageEvidence[];
}

export interface AdaptiveExecutionPlan {
  objective: string;
  executiveSummary: string;
  confidence: number;
  estimatedEffort: AdaptivePlanEffort;
  phases: AdaptivePlanPhase[];
  relevantSkills: SkillUsageEvidence[];
  organizationalContext: string;
  approvalCheckpoints: string[];
  recommendedWorkforce: AiosAgentKey[];
}

interface PlanInput {
  title: string;
  detail?: string | null;
  skills: SkillUsageEvidence[];
  organization: OrganizationalIntelligence;
}

const PHASE_CANDIDATES: Array<{
  id: string;
  title: string;
  keywords: string[];
  agent: AiosAgentKey;
  summary: string;
}> = [
  {
    id: "discovery",
    title: "Discovery",
    keywords: ["research", "customer", "market", "requirement", "investigate", "unknown"],
    agent: "horizon",
    summary: "Clarify the objective, constraints, prior context, and success criteria.",
  },
  {
    id: "knowledge",
    title: "Knowledge Review",
    keywords: ["julius", "memory", "documentation", "history", "decision", "context"],
    agent: "atlas",
    summary: "Retrieve relevant company memory, prior decisions, and reusable knowledge.",
  },
  {
    id: "risk",
    title: "Risk Review",
    keywords: ["security", "risk", "approval", "permission", "credential", "token", "policy"],
    agent: "aegis",
    summary: "Identify risk, approval needs, permissions, and safety constraints before execution.",
  },
  {
    id: "architecture",
    title: "Architecture",
    keywords: ["architecture", "design", "system", "integration", "database", "workflow"],
    agent: "auditor",
    summary: "Define the execution approach, interfaces, dependencies, and validation strategy.",
  },
  {
    id: "implementation",
    title: "Implementation",
    keywords: ["build", "implement", "create", "fix", "execute", "ship", "content", "campaign"],
    agent: "catalyst",
    summary: "Execute the core work using the selected approach and reusable company skills.",
  },
  {
    id: "communications",
    title: "Communications",
    keywords: ["customer", "email", "message", "reply", "launch", "announce", "stakeholder"],
    agent: "ambassador",
    summary: "Prepare stakeholder communication, customer-facing language, and follow-up routing.",
  },
  {
    id: "validation",
    title: "Validation",
    keywords: ["test", "qa", "verify", "validate", "audit", "review", "quality"],
    agent: "auditor",
    summary: "Validate the outcome, inspect regressions, and confirm completion evidence.",
  },
  {
    id: "operations",
    title: "Operational Readiness",
    keywords: ["deploy", "monitor", "production", "health", "connector", "incident"],
    agent: "pulse",
    summary: "Confirm operational readiness, monitoring, connector health, and recovery path.",
  },
  {
    id: "records",
    title: "Records & Approval Trail",
    keywords: ["approval", "record", "compliance", "audit", "finance", "payment"],
    agent: "ledger",
    summary: "Preserve the approval trail, records, and compliance evidence.",
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function effortFromSignals(phaseCount: number, approvalCount: number, skillCount: number): AdaptivePlanEffort {
  if (phaseCount >= 6 || approvalCount >= 2) return "high";
  if (phaseCount >= 4 || skillCount >= 2 || approvalCount === 1) return "medium";
  return "low";
}

function agentForSkillOwner(agent: string): AiosAgentKey | null {
  return getAiosAgent(agent)?.key ?? null;
}

function uniqueAgents(agents: AiosAgentKey[]): AiosAgentKey[] {
  return [...new Set(agents)].filter((agent) => Boolean(getAiosAgent(agent)));
}

function phaseConfidence(base: number, skillCount: number, organizationSignal: number): number {
  return Math.max(25, Math.min(95, Math.round(base + skillCount * 7 + organizationSignal)));
}

export function buildAdaptivePlanFromSignals(input: PlanInput): AdaptiveExecutionPlan {
  const query = normalize(`${input.title} ${input.detail ?? ""}`);
  const skillAgents = input.skills
    .map((skill) => agentForSkillOwner(skill.owner_agent))
    .filter((agent): agent is AiosAgentKey => Boolean(agent));
  const orgAgents = input.organization.strongestCollaboration?.agents
    .map((agent) => agentForSkillOwner(agent))
    .filter((agent): agent is AiosAgentKey => Boolean(agent)) ?? [];
  const candidateScores = PHASE_CANDIDATES.map((phase, index) => ({
    phase,
    score:
      matches(query, phase.keywords) * 5 +
      input.skills.filter((skill) => skill.owner_agent === phase.agent || skill.category.includes(phase.id)).length * 4 +
      (orgAgents.includes(phase.agent) ? 3 : 0) +
      (index === 0 ? 1 : 0),
  }));

  const selected = candidateScores
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ phase }) => phase);

  const basePhases = selected.length > 0
    ? selected
    : [
        PHASE_CANDIDATES[0],
        PHASE_CANDIDATES[3],
        PHASE_CANDIDATES[4],
        PHASE_CANDIDATES[6],
      ];
  const phasesWithValidation = basePhases.some((phase) => phase.id === "validation")
    ? basePhases
    : [...basePhases, PHASE_CANDIDATES.find((phase) => phase.id === "validation")!];

  const sortedPhases = [...new Map(phasesWithValidation.map((phase) => [phase.id, phase])).values()].sort(
    (a, b) =>
      PHASE_CANDIDATES.findIndex((phase) => phase.id === a.id) -
      PHASE_CANDIDATES.findIndex((phase) => phase.id === b.id),
  );

  const organizationSignal =
    input.organization.strongestCollaboration?.reliability
      ? Math.round(input.organization.strongestCollaboration.reliability / 12)
      : 0;
  const phases: AdaptivePlanPhase[] = sortedPhases.map((phase, index) => {
    const phaseSkills = input.skills
      .filter(
        (skill) =>
          skill.owner_agent === phase.agent ||
          phase.keywords.some((keyword) =>
            normalize(`${skill.title} ${skill.category} ${skill.summary}`).includes(keyword),
          ),
      )
      .slice(0, 2);
    const approvalCheckpoint =
      phase.id === "risk" ||
      phase.id === "records" ||
      phaseSkills.some((skill) => skill.approval_requirement !== "none") ||
      /production|publish|customer|payment|security|credential|token/.test(query);
    return {
      id: phase.id,
      title: phase.title,
      summary: phase.summary,
      recommendedAgent: phaseSkills[0] ? (agentForSkillOwner(phaseSkills[0].owner_agent) ?? phase.agent) : phase.agent,
      dependencies: index === 0 ? [] : [sortedPhases[index - 1].id],
      approvalCheckpoint,
      estimatedEffort: effortFromSignals(sortedPhases.length, approvalCheckpoint ? 1 : 0, phaseSkills.length),
      confidence: phaseConfidence(55, phaseSkills.length, organizationSignal),
      skills: phaseSkills,
    };
  });

  const approvalCheckpoints = phases
    .filter((phase) => phase.approvalCheckpoint)
    .map((phase) => phase.title);
  const recommendedWorkforce = uniqueAgents([
    "harmony",
    ...phases.map((phase) => phase.recommendedAgent),
    ...skillAgents,
    ...orgAgents,
  ]);
  const confidence = Math.round(
    phases.reduce((sum, phase) => sum + phase.confidence, 0) / Math.max(1, phases.length),
  );
  const estimatedEffort = effortFromSignals(phases.length, approvalCheckpoints.length, input.skills.length);
  const organizationalContext = formatOrganizationalContext(input.organization);
  const executiveSummary = [
    `Harmony planned ${phases.length} execution phase(s) for "${input.title}".`,
    `Recommended workforce: ${recommendedWorkforce.map((agent) => getAiosAgent(agent)?.name ?? agent).join(", ")}.`,
    input.skills.length > 0 ? `Relevant Company Skills: ${input.skills.slice(0, 3).map((skill) => skill.title).join(", ")}.` : "No reusable Company Skills matched strongly yet.",
    organizationalContext ? "Organizational Intelligence influenced sequencing and risk planning." : "No stable Organizational Intelligence signal was available yet.",
  ].join(" ");

  return {
    objective: input.title,
    executiveSummary,
    confidence,
    estimatedEffort,
    phases,
    relevantSkills: input.skills,
    organizationalContext,
    approvalCheckpoints,
    recommendedWorkforce,
  };
}

export function formatAdaptivePlan(plan: AdaptiveExecutionPlan): string {
  const phases = plan.phases
    .map(
      (phase, index) =>
        `${index + 1}. ${phase.title} — ${getAiosAgent(phase.recommendedAgent)?.name ?? phase.recommendedAgent}\n` +
        `   ${phase.summary}\n` +
        `   Dependencies: ${phase.dependencies.join(", ") || "None"}\n` +
        `   Approval checkpoint: ${phase.approvalCheckpoint ? "Yes" : "No"}\n` +
        `   Confidence: ${phase.confidence}/100; effort: ${phase.estimatedEffort}`,
    )
    .join("\n");
  const skills = formatSkillContext(plan.relevantSkills);
  return [
    "Adaptive Execution Plan",
    `Executive summary: ${plan.executiveSummary}`,
    `Planning confidence: ${plan.confidence}/100`,
    `Estimated effort: ${plan.estimatedEffort}`,
    `Approval checkpoints: ${plan.approvalCheckpoints.join(", ") || "None"}`,
    `Phases:\n${phases}`,
    skills ? `Company Skills used:\n${skills}` : "",
    plan.organizationalContext ? `Organizational Intelligence used:\n${plan.organizationalContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function appendAdaptivePlan(
  text: string | null | undefined,
  plan: AdaptiveExecutionPlan,
): string | null {
  const formatted = formatAdaptivePlan(plan);
  return `${text?.trim() ? `${text.trim()}\n\n` : ""}${formatted}`;
}

export async function buildAdaptiveExecutionPlan(params: {
  userId: string;
  companyId: string | null;
  title: string;
  detail?: string | null;
  agent?: AiosAgentKey | string | null;
  skills?: SkillUsageEvidence[];
  organization?: OrganizationalIntelligence;
}): Promise<AdaptiveExecutionPlan | null> {
  const title = params.title.trim();
  if (!params.companyId || !title) return null;
  const query = `${title}\n${params.detail ?? ""}`.trim();
  const [skills, organization] = await Promise.all([
    params.skills
      ? Promise.resolve(params.skills)
      : consultCompanySkills({
          userId: params.userId,
          companyId: params.companyId,
          agent: params.agent ?? "harmony",
          purpose: "objective_planning",
          query,
          limit: 6,
          emit: false,
        }).then((consultation) => consultation.skills),
    params.organization
      ? Promise.resolve(params.organization)
      : buildOrganizationalIntelligence(params.userId, params.companyId, { limit: 400 }),
  ]);

  return buildAdaptivePlanFromSignals({
    title,
    detail: params.detail,
    skills,
    organization,
  });
}

export function inferPrimaryPlanningAgent(plan: AdaptiveExecutionPlan | null): AiosAgentKey {
  if (!plan?.phases[0]) return "harmony";
  const agent = plan.phases[0].recommendedAgent;
  return AIOS_WORKFORCE.some((candidate) => candidate.key === agent) ? agent : "harmony";
}

export function availablePlanningAgents(): AiosAgentKey[] {
  return ["harmony", ...WORKFORCE_SPECIALISTS.map((agent) => agent.key)];
}
