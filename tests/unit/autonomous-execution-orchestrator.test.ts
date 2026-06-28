import { describe, expect, it } from "vitest";
import {
  buildAeoPlanFromState,
  formatAeoContextForHarmony,
  isMajorExecutionSequence,
} from "@/lib/harmony/autonomous-execution-orchestrator";
import type { ExecutiveWorkspace } from "@/lib/harmony/executive-workspace";
import type { WorkItem as AgentWorkItem } from "@/lib/workforce/work-queue";
import type { AgentObjective } from "@/lib/workforce/objectives";
import type { Approval, WorkItem as OsWorkItem } from "@/types/database";

const now = "2026-06-28T00:00:00.000Z";

function workspace(overrides: Partial<ExecutiveWorkspace> = {}): ExecutiveWorkspace {
  return {
    generatedAt: now,
    companyId: "company_1",
    snapshot: {
      companyHealth: "healthy",
      operationalHealth: "healthy",
      engineeringHealth: "healthy",
      aiWorkforceHealth: "healthy",
      criticalAlerts: [],
      recommendedPriorities: [],
      suggestedNextActions: [],
      confidenceLevel: "high",
    },
    departments: [],
    intelligence: {
      generatedAt: now,
      situation: "operating",
      headline: { key: "operating", primaryCount: 1 },
      metrics: {
        activeObjectives: 1,
        activeWork: 1,
        blockedWork: 0,
        pendingApprovals: 0,
        failedExecutions: 0,
        openRecommendations: 0,
        connectorIssues: 0,
        activeAgents: 4,
        completedToday: 1,
        juliusContext: 1,
      },
      recommendations: [],
      delegationRoutes: [],
      workforce: [],
      connectors: [],
      auditor: { report: { generatedAt: now, findings: [] } as never, risks: [], warnings: [], frequencyByDomain: [] },
      julius: { total: 1, recent: [], decisions: [], lessons: [] },
      skills: {
        relevant: [],
        metrics: {
          total: 1,
          recentlyLearned: 0,
          highestConfidence: 88,
          mostReused: null,
          fastestGrowingDomain: "operations",
        },
      },
      organization: {
        generatedAt: now,
        windowDays: 30,
        metrics: {
          collaborations: 1,
          completedExecutions: 4,
          blockedExecutions: 0,
          approvalFrequency: 10,
          averageCompletionHours: 3,
          objectiveCompletionRate: 80,
          activitySignals: 5,
        },
        strongestCollaboration: null,
        highestPerformingCollaboration: null,
        mostEffectivePattern: null,
        fastestImprovingMember: null,
        bottlenecks: [],
        collaborations: [],
        workforce: [],
        planningContext: "Execution is healthy.",
      },
      planning: {
        current: {
          objective: "Coordinate launch",
          executiveSummary: "Sequence launch work across the workforce.",
          confidence: 86,
          estimatedEffort: "medium",
          phases: [
            {
              id: "discovery",
              title: "Discovery",
              summary: "Confirm objective, context, and success criteria.",
              recommendedAgent: "horizon",
              dependencies: [],
              approvalCheckpoint: false,
              estimatedEffort: "low",
              confidence: 86,
              skills: [],
            },
            {
              id: "validation",
              title: "Validation",
              summary: "Validate execution readiness.",
              recommendedAgent: "pulse",
              dependencies: ["Discovery"],
              approvalCheckpoint: true,
              estimatedEffort: "medium",
              confidence: 82,
              skills: [],
            },
          ],
          relevantSkills: [],
          organizationalContext: "Use OIE patterns.",
          approvalCheckpoints: ["Founder approval before release"],
          recommendedWorkforce: ["harmony", "horizon", "pulse"],
        },
      },
      proactiveObjectives: { generated: [], created: [] },
      workforceOptimization: {
        generatedAt: now,
        recommendations: [],
        strongestOpportunity: null,
        overloadedAgents: [],
        underusedAgents: [],
        highPerformingCollaboration: null,
      },
    },
    recentExecutionHistory: ["Harmony delegated launch validation."],
    productionHealthSignals: [],
    masonEngineeringActivity: [],
    operationalDigitalTwin: null as never,
    promptContext: "Executive Workspace Context",
    ...overrides,
  };
}

function approval(): Approval {
  return {
    id: "approval_1",
    user_id: "user_1",
    company_id: "company_1",
    department_id: null,
    agent_id: null,
    work_item_id: "work_1",
    message_id: null,
    type: "deployment",
    title: "Approve launch sequence",
    summary: "Founder approval is needed before release.",
    status: "pending",
    risk: "high",
    decided_at: null,
    created_at: now,
    updated_at: now,
  };
}

function osWork(overrides: Partial<OsWorkItem> = {}): OsWorkItem {
  return {
    id: "work_1",
    user_id: "user_1",
    company_id: "company_1",
    department_id: null,
    project_id: null,
    objective_id: null,
    agent_id: null,
    title: "Launch validation",
    description: null,
    status: "awaiting_approval",
    priority: "high",
    position: 1,
    due_date: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function agentWork(overrides: Partial<AgentWorkItem> = {}): AgentWorkItem {
  return {
    id: "agent_work_1",
    user_id: "user_1",
    company_id: "company_1",
    agent: "mason",
    objective_id: null,
    title: "Implement deployment checks",
    detail: null,
    kind: "task",
    risk: "approval",
    status: "proposed",
    autonomy: "advisory",
    requires_approval: true,
    risk_level: "medium",
    category: "code",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
  return {
    id: "objective_1",
    user_id: "user_1",
    company_id: "company_1",
    agent: "harmony",
    title: "Launch the executive workspace",
    detail: null,
    status: "active",
    priority: "high",
    origin: "founder",
    progress: 10,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("autonomous execution orchestrator", () => {
  it("detects major execution prompts without treating casual chat as orchestration", () => {
    expect(isMajorExecutionSequence("Implement the launch workflow")).toBe(true);
    expect(isMajorExecutionSequence("business: coordinate customer follow-up")).toBe(true);
    expect(isMajorExecutionSequence("How are you today?")).toBe(false);
  });

  it("routes engineering execution through Mason and keeps approval resume guidance", () => {
    const plan = buildAeoPlanFromState({
      userId: "user_1",
      companyId: "company_1",
      objective: "Implement a repository deployment workflow repo: AIOS-HQ/aios-platform",
      workspace: workspace(),
      objectives: [objective({ agent: "mason", title: "Build deployment workflow" })],
      osWork: [osWork()],
      agentWork: [agentWork()],
      approvals: [approval()],
    });

    expect(plan.status).toBe("paused_for_approval");
    expect(plan.masonRuntimePlan?.provider).toBe("mason");
    expect(plan.affectedDepartments).toContain("Engineering (Mason)");
    expect(plan.blockers[0]?.kind).toBe("approval");
    expect(plan.nextRecommendedAction).toContain("Review Queue");
    expect(plan.estimatedCompletion).toBe("Paused until Founder approval is decided.");
  });

  it("formats Harmony context without creating a dashboard or duplicate state", () => {
    const plan = buildAeoPlanFromState({
      userId: "user_1",
      companyId: "company_1",
      objective: "Coordinate the customer launch sequence",
      workspace: workspace(),
      objectives: [objective()],
      osWork: [],
      agentWork: [],
      approvals: [],
    });
    const context = formatAeoContextForHarmony(plan);

    expect(context).toContain("Autonomous Execution Orchestrator Context");
    expect(context).toContain("Execution order");
    expect(context).toContain("Affected departments");
    expect(context).toContain("Next recommended action");
    expect(context).toContain("Do not create parallel state");
  });
});
