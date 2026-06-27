import "server-only";

import {
  MASON_AGENT_KEY,
  MASON_SAFE_EXECUTION_BOUNDARY,
  createMasonNativeRuntimePlan,
  getMasonConnectorCapabilities,
  type MasonNativeRuntimePlan,
  type MasonRuntimeStep,
} from "@/lib/harmony/code/mason";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { consultCompanySkills, recordSkillConsultation } from "@/lib/company-skills/utilization";
import { learnCompanySkill } from "@/lib/company-skills/library";
import { buildAdaptiveExecutionPlan, formatAdaptivePlan } from "@/lib/harmony/adaptive-planning";
import { emitActivity } from "@/lib/harmony/os/events";
import { runConnectorCapability, type ConnectorRunResult } from "@/lib/integrations/connector-runtime";
import { juliusRemember, juliusRecall } from "@/lib/julius/wiring";
import {
  buildOrganizationalIntelligence,
  formatOrganizationalContext,
} from "@/lib/organizational-intelligence/engine";

export interface MasonEngineeringRuntimeInput {
  userId: string;
  companyId: string;
  objective: string;
  detail?: string | null;
  repository?: string | null;
  objectiveId?: string | null;
  approvedForMutation?: boolean;
  approvedForAirbid?: boolean;
}

export interface MasonRuntimeArtifact {
  kind:
    | "repository_inspection"
    | "adaptive_plan"
    | "company_skills"
    | "organizational_intelligence"
    | "julius_context"
    | "delegation"
    | "memory";
  title: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface MasonEngineeringRuntimeResult {
  ok: boolean;
  status: "analysis_completed" | "approval_required" | "blocked" | "failed";
  plan: MasonNativeRuntimePlan;
  executedSteps: MasonRuntimeStep[];
  pendingApprovalSteps: MasonRuntimeStep[];
  blockedSteps: MasonRuntimeStep[];
  connectorResults: ConnectorRunResult[];
  artifacts: MasonRuntimeArtifact[];
  report: string;
}

function includesAirbid(input: MasonEngineeringRuntimeInput): boolean {
  return `${input.objective} ${input.detail ?? ""} ${input.repository ?? ""}`.toLowerCase().includes("airbid");
}

function connectorParams(step: MasonRuntimeStep, input: MasonEngineeringRuntimeInput): Record<string, unknown> {
  if (step.connector === "github" && input.repository) return { repo: input.repository };
  if (step.connector === "github") return {};
  if (step.connector === "vercel") {
    return {
      repo: input.repository ?? null,
      objective: input.objective,
    };
  }
  return {};
}

function parseConnectorCapability(step: MasonRuntimeStep): { connectorId: string; capabilityId: string } | null {
  if (!step.connector || !step.capabilityId.includes(".")) return null;
  const [connectorId, capabilityId] = step.capabilityId.split(".", 2);
  if (!connectorId || !capabilityId) return null;
  return { connectorId, capabilityId };
}

function stepCanRunAutomatically(step: MasonRuntimeStep): boolean {
  return step.status === "ready" && step.risk === "routine";
}

async function runSafeConnectorSteps(
  input: MasonEngineeringRuntimeInput,
  plan: MasonNativeRuntimePlan,
): Promise<ConnectorRunResult[]> {
  const allowed = getMasonConnectorCapabilities()
    .filter((entry) => entry.allowedForMason && entry.capability.mode === "read")
    .map((entry) => `${entry.connector}.${entry.capability.id}`);

  const results: ConnectorRunResult[] = [];
  for (const step of plan.steps.filter(stepCanRunAutomatically)) {
    const parsed = parseConnectorCapability(step);
    if (!parsed || !allowed.includes(step.capabilityId)) continue;
    results.push(
      await runConnectorCapability(
        input.userId,
        parsed.connectorId,
        parsed.capabilityId,
        connectorParams(step, input),
      ),
    );
  }
  return results;
}

function buildRuntimeReport(params: {
  input: MasonEngineeringRuntimeInput;
  plan: MasonNativeRuntimePlan;
  artifacts: MasonRuntimeArtifact[];
  connectorResults: ConnectorRunResult[];
  adaptivePlanText: string | null;
}): string {
  const { input, plan, artifacts, connectorResults, adaptivePlanText } = params;
  return [
    `Mason Engineering Runtime Report: ${input.objective}`,
    `Repository: ${input.repository ?? "Not selected"}`,
    `Provider: ${plan.provider}`,
    `Founder-only: ${String(!MASON_SAFE_EXECUTION_BOUNDARY.subscriberFacing)}`,
    `Automatic steps: ${plan.automaticSteps.map((step) => step.title).join(", ") || "None"}`,
    `Approval-gated steps: ${plan.approvalGatedSteps.map((step) => step.title).join(", ") || "None"}`,
    `Blocked steps: ${plan.blockedSteps.map((step) => step.title).join(", ") || "None"}`,
    `Connector checks: ${connectorResults.map((result) => `${result.status}:${result.message}`).join(", ") || "None"}`,
    `Artifacts: ${artifacts.map((artifact) => artifact.title).join(", ") || "None"}`,
    adaptivePlanText ? `Adaptive plan:\n${adaptivePlanText}` : null,
    plan.boundarySummary,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function recordMasonMemory(params: {
  input: MasonEngineeringRuntimeInput;
  plan: MasonNativeRuntimePlan;
  report: string;
  connectorResults: ConnectorRunResult[];
}): Promise<MasonRuntimeArtifact> {
  const { input, plan, report, connectorResults } = params;
  await juliusRemember({
    userId: input.userId,
    companyId: input.companyId,
    agent: MASON_AGENT_KEY,
    kind: "activity",
    title: `Mason engineering runtime: ${input.objective}`.slice(0, 300),
    content: report.slice(0, 8000),
    refs: {
      kind: "mason_engineering_runtime",
      objectiveId: input.objectiveId ?? null,
      repository: input.repository ?? null,
      categories: plan.classification.categories,
      filesChanged: [],
      validation: plan.executionPlan.validationSteps,
      connectorResults: connectorResults.map((result) => ({
        status: result.status,
        message: result.message,
      })),
      safeBoundary: MASON_SAFE_EXECUTION_BOUNDARY,
    },
    importance: plan.approvalGatedSteps.length > 0 ? 4 : 3,
  });

  await learnCompanySkill({
    userId: input.userId,
    companyId: input.companyId,
    ownerAgent: MASON_AGENT_KEY,
    title: input.objective,
    summary: plan.executionPlan.prReadySummary,
    outcome: report,
    category: plan.classification.categories[0] ?? "code",
    objectiveId: input.objectiveId ?? null,
    success: true,
    source: "objective",
    sourceId: input.objectiveId ?? null,
  });

  await emitActivity({
    userId: input.userId,
    companyId: input.companyId,
    actorType: "agent",
    actorId: MASON_AGENT_KEY,
    kind: "agent_action",
    summary: `Mason prepared engineering runtime report: ${input.objective}`.slice(0, 280),
    refType: "mason_engineering_runtime",
    refId: input.objectiveId ?? null,
  });

  return {
    kind: "memory",
    title: "Engineering memory recorded",
    summary: "Mason recorded the objective, repository, validation plan, connector results, and lessons through Julius.",
  };
}

export async function runMasonEngineeringRuntime(
  input: MasonEngineeringRuntimeInput,
): Promise<MasonEngineeringRuntimeResult> {
  const plan = createMasonNativeRuntimePlan({
    objective: input.objective,
    detail: input.detail,
    repository: input.repository,
  });

  if (!(await currentUserIsAdmin())) {
    return {
      ok: false,
      status: "blocked",
      plan,
      executedSteps: [],
      pendingApprovalSteps: plan.approvalGatedSteps,
      blockedSteps: [
        ...plan.blockedSteps,
        {
          id: "founder_gate",
          title: "Founder/admin authorization required",
          phase: "intake",
          capabilityId: "classify_engineering_tasks",
          risk: "destructive",
          status: "blocked",
          summary: "Mason is Founder-only and cannot run for subscriber-facing sessions.",
        },
      ],
      connectorResults: [],
      artifacts: [],
      report: "Mason runtime blocked: Founder/admin authorization required.",
    };
  }

  if (includesAirbid(input) && !input.approvedForAirbid) {
    return {
      ok: false,
      status: "blocked",
      plan,
      executedSteps: [],
      pendingApprovalSteps: plan.approvalGatedSteps,
      blockedSteps: [
        ...plan.blockedSteps,
        {
          id: "airbid_scope",
          title: "Explicit AirBid scope required",
          phase: "intake",
          capabilityId: "classify_engineering_tasks",
          risk: "destructive",
          status: "blocked",
          summary: "Mason must not operate on AirBid code or data unless the Founder explicitly scopes it.",
        },
      ],
      connectorResults: [],
      artifacts: [],
      report: "Mason runtime blocked: AirBid work requires explicit Founder scope.",
    };
  }

  const [organization, julius, adaptivePlan, connectorResults] = await Promise.all([
    buildOrganizationalIntelligence(input.userId, input.companyId, { limit: 400 }),
    juliusRecall(input.userId, input.companyId, input.objective, 8),
    buildAdaptiveExecutionPlan({
      userId: input.userId,
      companyId: input.companyId,
      title: input.objective,
      detail: input.detail,
      agent: MASON_AGENT_KEY,
    }),
    runSafeConnectorSteps(input, plan),
  ]);
  const skills = await consultCompanySkills({
    userId: input.userId,
    companyId: input.companyId,
    agent: MASON_AGENT_KEY,
    purpose: "objective_planning",
    query: `${input.objective}\n${input.detail ?? ""}`,
    context: { organization, adaptivePlan },
    emit: false,
  });

  const artifacts: MasonRuntimeArtifact[] = [
    {
      kind: "company_skills",
      title: "Company Skills consulted",
      summary: `${skills.skills.length} relevant skill(s) consulted before Mason planned execution.`,
      data: { skills: skills.skills },
    },
    {
      kind: "organizational_intelligence",
      title: "Organizational Intelligence consulted",
      summary: formatOrganizationalContext(organization) || "No stable organizational execution signal yet.",
      data: {
        strongestCollaboration: organization.strongestCollaboration,
        bottlenecks: organization.bottlenecks.slice(0, 3),
      },
    },
    {
      kind: "julius_context",
      title: "Julius context retrieved",
      summary: `${julius.length} relevant Julius entr${julius.length === 1 ? "y" : "ies"} retrieved for engineering context.`,
      data: { entries: julius.map((entry) => ({ id: entry.id, title: entry.title, kind: entry.kind })) },
    },
  ];

  if (adaptivePlan) {
    artifacts.push({
      kind: "adaptive_plan",
      title: "Adaptive Planning reused",
      summary: `${adaptivePlan.phases.length} phase(s), confidence ${adaptivePlan.confidence}/100.`,
      data: { plan: adaptivePlan },
    });
  }

  const coordinated = plan.steps.filter((step) => step.delegatesTo?.length);
  if (coordinated.length > 0) {
    artifacts.push({
      kind: "delegation",
      title: "Code department coordination prepared",
      summary: coordinated
        .map((step) => `${step.title}: ${(step.delegatesTo ?? []).join(", ")}`)
        .join("; "),
    });
  }

  if (skills.skills.length > 0) {
    await recordSkillConsultation({
      userId: input.userId,
      companyId: input.companyId,
      agent: MASON_AGENT_KEY,
      consultation: skills,
      sourceType: "mason_engineering_runtime",
      sourceId: input.objectiveId ?? input.objective,
    }).catch(() => {});
  }

  const adaptivePlanText = adaptivePlan ? formatAdaptivePlan(adaptivePlan) : null;
  const report = buildRuntimeReport({
    input,
    plan,
    artifacts,
    connectorResults,
    adaptivePlanText,
  });
  artifacts.push(await recordMasonMemory({ input, plan, report, connectorResults }));

  const status = plan.approvalGatedSteps.length > 0 ? "approval_required" : "analysis_completed";

  return {
    ok: true,
    status,
    plan,
    executedSteps: plan.automaticSteps,
    pendingApprovalSteps: plan.approvalGatedSteps,
    blockedSteps: plan.blockedSteps,
    connectorResults,
    artifacts,
    report,
  };
}
