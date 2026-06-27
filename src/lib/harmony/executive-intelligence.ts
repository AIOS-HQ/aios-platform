import "server-only";

import { runAudit, type AuditFinding, type AuditReport } from "@/lib/agents/auditor/service";
import { getConnections } from "@/lib/integrations/connections";
import { CONNECTORS } from "@/lib/integrations/connectors";
import { getConnectorStatus } from "@/lib/integrations/connector-config";
import { getJuliusAwareness } from "@/lib/julius/wiring";
import { listJuliusEntries, type JuliusEntry } from "@/lib/julius/service";
import { listWorkItems, type WorkItem } from "@/lib/workforce/work-queue";
import { listObjectives, type AgentObjective } from "@/lib/workforce/objectives";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { getAutonomyState, listAutonomyAudit } from "@/lib/workforce/autonomy";
import {
  AIOS_WORKFORCE,
  AGENT_CONNECTORS,
  getAiosAgent,
  type AiosAgentKey,
} from "@/lib/workforce/registry";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import {
  buildOrganizationalIntelligence,
  type OrganizationalIntelligence,
} from "@/lib/organizational-intelligence/engine";
import {
  buildAdaptiveExecutionPlan,
  type AdaptiveExecutionPlan,
} from "@/lib/harmony/adaptive-planning";
import {
  ensureAutonomousObjectiveProposals,
  generateObjectiveProposals,
  type GeneratedObjectiveProposal,
} from "@/lib/harmony/objective-generation";
import {
  consultCompanySkills,
  type SkillUsageEvidence,
  type SkillConsultationPurpose,
} from "@/lib/company-skills/utilization";
import {
  listCompanySkills,
  summarizeSkillMetrics,
  type CompanySkill,
} from "@/lib/company-skills/library";
import { retrieveCompanySkills } from "@/lib/company-skills/retrieval";

type Priority = "critical" | "high" | "medium" | "low";
type Situation = "critical" | "attention" | "operating" | "quiet";

export interface ExecutiveConnectorState {
  id: string;
  name: string;
  status: string;
  account: string | null;
}

export interface ExecutiveRecommendation {
  id: string;
  priority: Priority;
  kind:
    | "review_approvals"
    | "unblock_work"
    | "reconnect_connector"
    | "investigate_auditor_risk"
    | "delegate_objective_work"
    | "review_failed_execution"
    | "review_agent_recommendation"
    | "reuse_company_skill"
    | "apply_organizational_pattern"
    | "resolve_organizational_bottleneck"
    | "review_adaptive_plan"
    | "continue_operating";
  agent: string;
  href: string;
  title: string;
  detail: string;
  impact: number;
  skillsUsed?: SkillUsageEvidence[];
}

export interface DelegationRoute {
  id: string;
  agent: string;
  reason: string;
  load: number;
  confidence: "high" | "medium" | "low";
  source: "objective" | "blocked_work" | "connector" | "auditor" | "approval";
  href: string;
}

export interface WorkforceSignal {
  agent: string;
  activeWork: number;
  blockedWork: number;
  pendingApprovals: number;
  recommendations: number;
  juliusEntries: number;
}

export interface ExecutiveIntelligence {
  generatedAt: string;
  situation: Situation;
  headline: {
    key: "critical" | "attention" | "operating" | "quiet";
    primaryCount: number;
  };
  metrics: {
    activeObjectives: number;
    activeWork: number;
    blockedWork: number;
    pendingApprovals: number;
    failedExecutions: number;
    openRecommendations: number;
    connectorIssues: number;
    activeAgents: number;
    completedToday: number;
    juliusContext: number;
  };
  recommendations: ExecutiveRecommendation[];
  delegationRoutes: DelegationRoute[];
  workforce: WorkforceSignal[];
  connectors: ExecutiveConnectorState[];
  auditor: {
    report: AuditReport;
    risks: AuditFinding[];
    warnings: AuditFinding[];
    frequencyByDomain: { domain: string; count: number; highest: Priority }[];
  };
  julius: {
    total: number;
    recent: JuliusEntry[];
    decisions: JuliusEntry[];
    lessons: JuliusEntry[];
  };
  skills: {
    relevant: CompanySkill[];
    metrics: ReturnType<typeof summarizeSkillMetrics>;
  };
  organization: OrganizationalIntelligence;
  planning: {
    current: AdaptiveExecutionPlan | null;
  };
  proactiveObjectives: {
    generated: GeneratedObjectiveProposal[];
    created: AgentObjective[];
  };
}

const ACTIVE_WORK = new Set(["proposed", "approved", "in_progress"]);
const TODAY_DECISIONS = new Set(["auto_executed", "notified"]);

const PRIORITY_SCORE: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const AGENT_BY_CATEGORY: Record<string, AiosAgentKey> = {
  security: "aegis",
  destructive: "aegis",
  code: "auditor",
  architecture: "auditor",
  publishing: "catalyst",
  communications: "ambassador",
  financial: "ledger",
  operational: "pulse",
  research: "horizon",
};

function agentName(key: string): string {
  return getAiosAgent(key)?.name ?? key;
}

function priorityFromSeverity(severity: AuditFinding["severity"]): Priority {
  if (severity === "risk") return "critical";
  if (severity === "warn") return "high";
  if (severity === "info") return "medium";
  return "low";
}

function highestPriority(items: Priority[]): Priority {
  return items.sort((a, b) => PRIORITY_SCORE[b] - PRIORITY_SCORE[a])[0] ?? "low";
}

function routeForWork(work: WorkItem): AiosAgentKey {
  if (work.category && AGENT_BY_CATEGORY[work.category]) {
    return AGENT_BY_CATEGORY[work.category];
  }
  if (work.risk === "destructive" || work.risk_level === "critical") return "aegis";
  return (getAiosAgent(work.agent)?.key as AiosAgentKey | undefined) ?? "harmony";
}

function routeForFinding(finding: AuditFinding): AiosAgentKey {
  if (finding.domain === "security" || finding.domain === "risk") return "aegis";
  if (finding.domain === "deployment" || finding.domain === "configuration") return "pulse";
  if (finding.domain === "approvals" || finding.domain === "governance") return "ledger";
  return "auditor";
}

function routeForObjective(objective: AgentObjective): AiosAgentKey {
  return (getAiosAgent(objective.agent)?.key as AiosAgentKey | undefined) ?? "horizon";
}

function addRecommendation(
  list: ExecutiveRecommendation[],
  rec: Omit<ExecutiveRecommendation, "impact">,
) {
  list.push({ ...rec, impact: PRIORITY_SCORE[rec.priority] });
}

function recommendationSkillPurpose(kind: ExecutiveRecommendation["kind"]): SkillConsultationPurpose {
  if (kind === "delegate_objective_work") return "delegation";
  if (kind === "reuse_company_skill") return "recommendation";
  if (kind === "continue_operating") return "recommendation";
  return "recommendation";
}

async function attachRecommendationSkills(params: {
  userId: string;
  companyId: string | null;
  recommendations: ExecutiveRecommendation[];
}) {
  if (!params.companyId) return params.recommendations;
  return Promise.all(
    params.recommendations.map(async (rec) => {
      if (rec.kind === "reuse_company_skill") return rec;
      const consultation = await consultCompanySkills({
        userId: params.userId,
        companyId: params.companyId,
        agent: rec.agent,
        purpose: recommendationSkillPurpose(rec.kind),
        query: `${rec.title}\n${rec.detail}`,
        limit: 2,
        emit: false,
      });
      return consultation.skills.length > 0
        ? { ...rec, skillsUsed: consultation.skills }
        : rec;
    }),
  );
}

function sortRecommendations(recs: ExecutiveRecommendation[]): ExecutiveRecommendation[] {
  return recs
    .sort((a, b) => b.impact - a.impact || a.title.localeCompare(b.title))
    .slice(0, 8);
}

export async function buildHarmonyExecutiveIntelligence(
  userId: string,
  companyId: string | null,
): Promise<ExecutiveIntelligence> {
  const connectionsPromise = getConnections(userId);
  const [
    report,
    work,
    objectives,
    recs,
    audit,
    autonomy,
    messages,
    awareness,
    juliusEntries,
    companySkills,
    organization,
  ] = await Promise.all([
    runAudit(userId),
    listWorkItems(userId, { companyId, limit: 400 }),
    listObjectives(userId, { companyId, limit: 300 }),
    listRecommendations(userId, { companyId, status: "open", limit: 200 }),
    listAutonomyAudit(userId, 300),
    getAutonomyState(userId),
    companyId ? listAgentMessages(userId, companyId, { limit: 300 }) : Promise.resolve([]),
    companyId
      ? getJuliusAwareness(userId, companyId)
      : Promise.resolve({ objectives: [], decisions: [], activities: [], knowledge: [], total: 0 }),
    companyId ? listJuliusEntries(userId, companyId, { limit: 200 }) : Promise.resolve([]),
    companyId ? listCompanySkills(userId, companyId, { limit: 200 }) : Promise.resolve([]),
    buildOrganizationalIntelligence(userId, companyId, { limit: 400 }),
  ]);

  const connections = await connectionsPromise;
  const connByProvider = new Map(connections.map((c) => [c.provider, c]));
  const connectors = CONNECTORS.filter((c) => c.authorizable).map((c) => {
    const conn = connByProvider.get(c.id);
    return {
      id: c.id,
      name: c.name,
      status: getConnectorStatus(c, conn),
      account: conn?.external_account ?? null,
    };
  });

  const activeWork = work.filter((w) => ACTIVE_WORK.has(w.status));
  const blockedWork = work.filter((w) => w.status === "blocked");
  const proposedWork = work.filter((w) => w.status === "proposed");
  const activeObjectives = objectives.filter((o) => o.status === "active");
  const proposedObjectives = objectives.filter((o) => o.status === "proposed");
  const pendingMessages = messages.filter((m) => m.status === "awaiting_approval");
  const blockedMessages = messages.filter((m) => m.status === "blocked");
  const connectorIssues = connectors.filter((c) => c.status === "expired");
  const risks = report.findings.filter((f) => f.severity === "risk");
  const warnings = report.findings.filter((f) => f.severity === "warn");
  const failedExecutions = report.findings
    .filter((f) => f.domain === "workflow" && /failed/i.test(f.detail))
    .reduce((sum, f) => {
      const match = f.detail.match(/^(\d+)\//);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const completedToday = audit.filter(
    (a) => TODAY_DECISIONS.has(a.decision) && new Date(a.created_at) >= todayStart,
  ).length;

  const activeAgentKeys = new Set<string>();
  for (const w of activeWork) activeAgentKeys.add(w.agent);
  for (const m of messages.filter((m) => ACTIVE_WORK.has(m.status) || m.status === "awaiting_approval")) {
    activeAgentKeys.add(m.to_agent);
  }
  for (const a of AIOS_WORKFORCE) {
    if ((autonomy.agents[a.key]?.mode ?? autonomy.global.mode) !== "off") activeAgentKeys.add(a.key);
  }

  const recommendations: ExecutiveRecommendation[] = [];
  if (pendingMessages.length + proposedWork.length + proposedObjectives.length > 0) {
    addRecommendation(recommendations, {
      id: "review-approvals",
      priority: pendingMessages.length > 0 ? "high" : "medium",
      kind: "review_approvals",
      agent: "harmony",
      href: "/harmony/review",
      title: String(pendingMessages.length + proposedWork.length + proposedObjectives.length),
      detail: pendingMessages[0]?.subject ?? proposedWork[0]?.title ?? proposedObjectives[0]?.title ?? "",
    });
  }
  for (const w of blockedWork.slice(0, 3)) {
    addRecommendation(recommendations, {
      id: `unblock-${w.id}`,
      priority: w.risk_level === "critical" || w.risk === "destructive" ? "critical" : "high",
      kind: "unblock_work",
      agent: routeForWork(w),
      href: "/harmony/work",
      title: w.title,
      detail: w.detail ?? agentName(w.agent),
    });
  }
  for (const c of connectorIssues) {
    addRecommendation(recommendations, {
      id: `connector-${c.id}`,
      priority: "high",
      kind: "reconnect_connector",
      agent: "pulse",
      href: "/settings/connections",
      title: c.name,
      detail: c.account ?? "",
    });
  }
  for (const f of risks.slice(0, 4)) {
    addRecommendation(recommendations, {
      id: `risk-${f.domain}-${f.title}`,
      priority: "critical",
      kind: "investigate_auditor_risk",
      agent: routeForFinding(f),
      href: "/settings/auditor",
      title: f.title,
      detail: f.detail,
    });
  }
  if (failedExecutions > 0) {
    addRecommendation(recommendations, {
      id: "failed-executions",
      priority: "high",
      kind: "review_failed_execution",
      agent: "auditor",
      href: "/settings/activity",
      title: String(failedExecutions),
      detail: report.findings.find((f) => f.domain === "workflow")?.detail ?? "",
    });
  }
  const workObjectiveIds = new Set(
    work.map((w) => w.objective_id).filter((id): id is string => Boolean(id)),
  );
  for (const o of activeObjectives.filter((o) => !workObjectiveIds.has(o.id)).slice(0, 3)) {
    addRecommendation(recommendations, {
      id: `objective-${o.id}`,
      priority: o.priority === "high" ? "high" : "medium",
      kind: "delegate_objective_work",
      agent: routeForObjective(o),
      href: `/harmony/workforce/${routeForObjective(o)}`,
      title: o.title,
      detail: o.detail ?? agentName(o.agent),
    });
  }
  const planningTarget =
    activeObjectives.find((o) => !workObjectiveIds.has(o.id)) ??
    proposedObjectives[0] ??
    null;
  const adaptivePlan = planningTarget
    ? await buildAdaptiveExecutionPlan({
        userId,
        companyId,
        title: planningTarget.title,
        detail: planningTarget.detail,
        agent: planningTarget.agent,
      })
    : null;
  const generatedObjectiveProposals = companyId
    ? generateObjectiveProposals({
        auditFindings: report.findings,
        work,
        objectives,
        companySkills,
        organization,
        adaptivePlan,
      })
    : [];
  const createdProactiveObjectives = companyId
    ? await ensureAutonomousObjectiveProposals({
        userId,
        companyId,
        proposals: generatedObjectiveProposals,
        existingObjectives: objectives,
        limit: 3,
      })
    : [];
  if (adaptivePlan) {
    addRecommendation(recommendations, {
      id: `adaptive-plan-${planningTarget?.id ?? adaptivePlan.objective}`,
      priority: adaptivePlan.confidence >= 75 ? "high" : "medium",
      kind: "review_adaptive_plan",
      agent: "harmony",
      href: planningTarget ? `/harmony/workforce/${planningTarget.agent}` : "/harmony/workforce",
      title: adaptivePlan.objective,
      detail: adaptivePlan.executiveSummary,
    });
  }
  if (createdProactiveObjectives.length > 0) {
    addRecommendation(recommendations, {
      id: "proactive-objectives",
      priority: createdProactiveObjectives.some((objective) => objective.priority === "high") ? "high" : "medium",
      kind: "review_approvals",
      agent: "harmony",
      href: "/harmony/review",
      title: String(createdProactiveObjectives.length),
      detail: `Newly proposed objective: ${createdProactiveObjectives[0]?.title ?? ""}`,
    });
  }
  for (const rec of recs.slice(0, 3)) {
    addRecommendation(recommendations, {
      id: `agent-rec-${rec.id}`,
      priority: "medium",
      kind: "review_agent_recommendation",
      agent: rec.agent,
      href: "/harmony/review",
      title: rec.title,
      detail: rec.rationale ?? rec.detail ?? "",
    });
  }
  const skillQuery = [
    ...activeObjectives.slice(0, 3).map((o) => o.title),
    ...blockedWork.slice(0, 3).map((w) => w.title),
    ...risks.slice(0, 3).map((f) => f.title),
  ].join(" ");
  const relevantSkills = companyId
    ? (await retrieveCompanySkills({
        userId,
        companyId,
        query: skillQuery || "company operations",
        limit: 5,
        context: { organization, adaptivePlan },
      })).skills
    : [];
  for (const skill of relevantSkills.slice(0, 2)) {
    addRecommendation(recommendations, {
      id: `skill-${skill.id}`,
      priority: skill.confidence_score >= 75 ? "high" : "medium",
      kind: "reuse_company_skill",
      agent: skill.owner_agent,
      href: "/harmony/julius",
      title: skill.title,
      detail: skill.summary,
    });
  }
  if (organization.mostEffectivePattern) {
    addRecommendation(recommendations, {
      id: `oie-pattern-${organization.mostEffectivePattern.id}`,
      priority: organization.mostEffectivePattern.confidence >= 75 ? "high" : "medium",
      kind: "apply_organizational_pattern",
      agent: "harmony",
      href: "/harmony/workforce",
      title: organization.mostEffectivePattern.title,
      detail: organization.mostEffectivePattern.detail,
    });
  }
  if (organization.bottlenecks[0]) {
    addRecommendation(recommendations, {
      id: `oie-bottleneck-${organization.bottlenecks[0].id}`,
      priority: organization.bottlenecks[0].severity === "high" ? "high" : "medium",
      kind: "resolve_organizational_bottleneck",
      agent: "harmony",
      href: "/harmony/operations",
      title: organization.bottlenecks[0].title,
      detail: organization.bottlenecks[0].recommendation,
    });
  }
  if (recommendations.length === 0) {
    addRecommendation(recommendations, {
      id: "continue-operating",
      priority: "low",
      kind: "continue_operating",
      agent: "harmony",
      href: "/harmony/workforce",
      title: agentName("harmony"),
      detail: "",
    });
  }
  const recommendationsWithSkills = await attachRecommendationSkills({
    userId,
    companyId,
    recommendations,
  });

  const loadByAgent = new Map<string, number>();
  for (const w of activeWork) loadByAgent.set(w.agent, (loadByAgent.get(w.agent) ?? 0) + 1);
  for (const m of messages.filter((m) => m.status === "delegated" || m.status === "in_progress")) {
    loadByAgent.set(m.to_agent, (loadByAgent.get(m.to_agent) ?? 0) + 1);
  }

  const delegationRoutes: DelegationRoute[] = [
    ...blockedWork.slice(0, 3).map((w) => {
      const agent = routeForWork(w);
      return {
        id: `blocked-${w.id}`,
        agent,
        reason: w.title,
        load: loadByAgent.get(agent) ?? 0,
        confidence: w.category || w.risk_level ? "high" as const : "medium" as const,
        source: "blocked_work" as const,
        href: `/harmony/workforce/${agent}`,
      };
    }),
    ...activeObjectives.filter((o) => !workObjectiveIds.has(o.id)).slice(0, 3).map((o) => {
      const agent = routeForObjective(o);
      return {
        id: `objective-${o.id}`,
        agent,
        reason: o.title,
        load: loadByAgent.get(agent) ?? 0,
        confidence: "medium" as const,
        source: "objective" as const,
        href: `/harmony/workforce/${agent}`,
      };
    }),
    ...risks.slice(0, 2).map((f) => {
      const agent = routeForFinding(f);
      return {
        id: `auditor-${f.domain}-${f.title}`,
        agent,
        reason: f.title,
        load: loadByAgent.get(agent) ?? 0,
        confidence: "high" as const,
        source: "auditor" as const,
        href: `/harmony/workforce/${agent}`,
      };
    }),
  ].slice(0, 6);

  const juliusByAgent = new Map<string, number>();
  for (const e of juliusEntries) {
    juliusByAgent.set(e.agent, (juliusByAgent.get(e.agent) ?? 0) + 1);
  }

  const workforce: WorkforceSignal[] = AIOS_WORKFORCE.map((agent) => ({
    agent: agent.key,
    activeWork: activeWork.filter((w) => w.agent === agent.key).length,
    blockedWork: blockedWork.filter((w) => w.agent === agent.key).length,
    pendingApprovals: pendingMessages.filter((m) => m.to_agent === agent.key).length,
    recommendations: recs.filter((r) => r.agent === agent.key).length,
    juliusEntries: juliusByAgent.get(agent.key) ?? 0,
  }));

  const domainPriorities = new Map<string, Priority[]>();
  for (const f of report.findings) {
    const list = domainPriorities.get(f.domain) ?? [];
    list.push(priorityFromSeverity(f.severity));
    domainPriorities.set(f.domain, list);
  }

  const attentionCount =
    pendingMessages.length +
    proposedWork.length +
    proposedObjectives.length +
    createdProactiveObjectives.length +
    blockedWork.length +
    blockedMessages.length +
    connectorIssues.length +
    risks.length;
  const situation: Situation =
    risks.length > 0 || connectorIssues.length > 0
      ? "critical"
      : attentionCount > 0 || warnings.length > 0
        ? "attention"
        : activeWork.length > 0 || activeObjectives.length > 0
          ? "operating"
          : "quiet";

  return {
    generatedAt: new Date().toISOString(),
    situation,
    headline: {
      key: situation,
      primaryCount: situation === "critical" || situation === "attention" ? attentionCount : activeWork.length,
    },
    metrics: {
      activeObjectives: activeObjectives.length,
      activeWork: activeWork.length + messages.filter((m) => m.status === "delegated" || m.status === "in_progress").length,
      blockedWork: blockedWork.length + blockedMessages.length,
      pendingApprovals:
        pendingMessages.length + proposedWork.length + proposedObjectives.length + createdProactiveObjectives.length,
      failedExecutions,
      openRecommendations: recs.length,
      connectorIssues: connectorIssues.length,
      activeAgents: activeAgentKeys.size,
      completedToday,
      juliusContext: awareness.total,
    },
    recommendations: sortRecommendations(recommendationsWithSkills),
    delegationRoutes,
    workforce,
    connectors,
    auditor: {
      report,
      risks,
      warnings,
      frequencyByDomain: [...domainPriorities.entries()]
        .map(([domain, priorities]) => ({
          domain,
          count: priorities.length,
          highest: highestPriority(priorities),
        }))
        .sort((a, b) => PRIORITY_SCORE[b.highest] - PRIORITY_SCORE[a.highest] || b.count - a.count),
    },
    julius: {
      total: awareness.total,
      recent: juliusEntries.slice(0, 5),
      decisions: juliusEntries.filter((e) => e.kind === "decision").slice(0, 4),
      lessons: juliusEntries
        .filter((e) => e.kind === "knowledge" || e.kind === "historical")
        .slice(0, 4),
    },
    skills: {
      relevant: relevantSkills,
      metrics: summarizeSkillMetrics(companySkills),
    },
    organization,
    planning: {
      current: adaptivePlan,
    },
    proactiveObjectives: {
      generated: generatedObjectiveProposals,
      created: createdProactiveObjectives,
    },
  };
}

export function getAgentConnectorInitials(agent: string): string[] {
  return (AGENT_CONNECTORS[agent as AiosAgentKey] ?? []).map((id) => id.toUpperCase());
}

export async function chooseHarmonyDelegatee(params: {
  userId: string;
  companyId: string;
  subject: string;
  body?: string;
  risk?: "routine" | "approval" | "destructive";
}): Promise<string> {
  const text = `${params.subject} ${params.body ?? ""}`.toLowerCase();
  if (params.risk === "destructive") return "aegis";

  const keywordScores: Record<AiosAgentKey, string[]> = {
    harmony: [],
    auditor: ["audit", "test", "lint", "bug", "failure", "failed", "regression", "quality"],
    mason: [
      "code",
      "software",
      "website",
      "web app",
      "mobile app",
      "api",
      "database",
      "github",
      "repository",
      "pull request",
      "build",
      "deploy",
      "refactor",
      "typescript",
    ],
    catalyst: ["content", "post", "blog", "campaign", "growth", "seo", "linkedin", "publish"],
    ambassador: ["customer", "reply", "email", "message", "conversation", "support", "lead"],
    atlas: ["memory", "julius", "knowledge", "document", "decision", "history", "context"],
    pulse: ["monitor", "uptime", "health", "deployment", "vercel", "supabase", "connector"],
    horizon: ["strategy", "roadmap", "plan", "objective", "priority", "forecast", "scenario"],
    aegis: ["security", "risk", "secret", "token", "permission", "credential", "threat"],
    ledger: ["approval", "record", "compliance", "audit trail", "policy", "finance"],
  };

  const [work, messages] = await Promise.all([
    listWorkItems(params.userId, { companyId: params.companyId, limit: 300 }),
    listAgentMessages(params.userId, params.companyId, { limit: 300 }),
  ]);
  const skillConsultation = await consultCompanySkills({
    userId: params.userId,
    companyId: params.companyId,
    agent: "harmony",
    purpose: "delegation",
    query: `${params.subject}\n${params.body ?? ""}`,
    limit: 6,
    emit: false,
  });
  const organization = await buildOrganizationalIntelligence(params.userId, params.companyId, {
    limit: 300,
  });
  const load = new Map<string, number>();
  for (const w of work.filter((w) => ACTIVE_WORK.has(w.status))) {
    load.set(w.agent, (load.get(w.agent) ?? 0) + 1);
  }
  for (const m of messages.filter((m) => m.status === "delegated" || m.status === "in_progress")) {
    load.set(m.to_agent, (load.get(m.to_agent) ?? 0) + 1);
  }

  const candidates = AIOS_WORKFORCE.filter((agent) => agent.key !== "harmony").map((agent) => {
    const keywordScore = keywordScores[agent.key].reduce(
      (score, keyword) => score + (text.includes(keyword) ? 3 : 0),
      0,
    );
    const responsibilityScore = agent.responsibilities.reduce(
      (score, responsibility) =>
        score + (text.includes(responsibility.toLowerCase().split(" ")[0] ?? "") ? 1 : 0),
      0,
    );
    const riskScore =
      params.risk === "approval" && (agent.key === "ledger" || agent.key === "aegis") ? 2 : 0;
    const skillScore = skillConsultation.skills
      .filter((skill) => skill.owner_agent === agent.key)
      .reduce((score, skill) => score + 2 + skill.confidence_score / 25 + skill.success_count, 0);
    const collaborationScore = organization.collaborations
      .filter((collaboration) => collaboration.agents.includes(agent.key))
      .reduce((score, collaboration) => score + collaboration.reliability / 25 + collaboration.completed, 0);
    return {
      agent: agent.key,
      score:
        keywordScore +
        responsibilityScore +
        riskScore +
        skillScore +
        collaborationScore -
        (load.get(agent.key) ?? 0),
    };
  });

  return candidates.sort((a, b) => b.score - a.score)[0]?.agent ?? "auditor";
}
