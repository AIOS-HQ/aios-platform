import { describe, expect, it } from "vitest";
import {
  buildExecutiveSnapshotFromIntelligence,
  departmentNamesForWorkspace,
  formatExecutiveWorkspaceForPrompt,
} from "@/lib/harmony/executive-workspace";
import type { ExecutiveIntelligence } from "@/lib/harmony/executive-intelligence";
import type { OpsEvent } from "@/lib/observability/ops";
import type { ActivityEvent, Department } from "@/types/database";

const now = "2026-06-27T00:00:00.000Z";

const departments: Department[] = [
  {
    id: "department_engineering",
    user_id: "user_1",
    company_id: "company_1",
    key: "engineering",
    name: "Engineering",
    description: "Product engineering",
    autonomy_level: 2,
    status: "active",
    position: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: "department_operations",
    user_id: "user_1",
    company_id: "company_1",
    key: "operations",
    name: "Operations",
    description: "Operating cadence",
    autonomy_level: 2,
    status: "active",
    position: 2,
    created_at: now,
    updated_at: now,
  },
];

const recentActivity: ActivityEvent[] = [
  {
    id: "activity_1",
    user_id: "user_1",
    company_id: "company_1",
    department_id: null,
    actor_type: "agent",
    actor_id: "mason",
    kind: "work_completed",
    summary: "Mason completed preview validation for the auth shell.",
    ref_type: "work_item",
    ref_id: "work_1",
    created_at: now,
  },
];

const opsEvents: OpsEvent[] = [
  {
    id: "ops_1",
    user_id: "user_1",
    company_id: "company_1",
    level: "error",
    source: "vercel",
    message: "Production deployment check requires Founder review.",
    context: {},
    resolved: false,
    created_at: now,
  },
];

const intelligence: ExecutiveIntelligence = {
  generatedAt: now,
  situation: "attention",
  headline: {
    key: "attention",
    primaryCount: 2,
  },
  metrics: {
    activeObjectives: 3,
    activeWork: 5,
    blockedWork: 1,
    pendingApprovals: 2,
    failedExecutions: 0,
    openRecommendations: 2,
    connectorIssues: 1,
    activeAgents: 6,
    completedToday: 4,
    juliusContext: 2,
  },
  recommendations: [
    {
      id: "rec_1",
      priority: "high",
      kind: "review_adaptive_plan",
      agent: "harmony",
      href: "/harmony/briefing",
      title: "Review the launch execution plan",
      detail: "Confirm the next two priorities before agents continue.",
      impact: 90,
    },
  ],
  delegationRoutes: [],
  workforce: [
    {
      agent: "mason",
      activeWork: 2,
      blockedWork: 0,
      pendingApprovals: 1,
      recommendations: 1,
      juliusEntries: 1,
    },
    {
      agent: "harmony",
      activeWork: 1,
      blockedWork: 1,
      pendingApprovals: 1,
      recommendations: 1,
      juliusEntries: 1,
    },
  ],
  connectors: [],
  auditor: {
    report: { generatedAt: now, findings: [] } as ExecutiveIntelligence["auditor"]["report"],
    risks: [
      {
        id: "risk_1",
        severity: "risk",
        domain: "production",
        title: "Production deployment needs review",
        detail: "Deployment health should be checked before merging.",
        recommendation: "Review Vercel and GitHub checks.",
      },
    ],
    warnings: [],
    frequencyByDomain: [],
  },
  julius: {
    total: 2,
    recent: [
      {
        id: "julius_1",
        user_id: "user_1",
        company_id: "company_1",
        agent: "atlas",
        kind: "decision",
        title: "Use reusable Executive Workspace context",
        content: "Harmony should read reusable organizational context first.",
        refs: {},
        importance: 5,
        created_at: now,
        updated_at: now,
      },
    ],
    decisions: [],
    lessons: [],
  },
  skills: {
    relevant: [],
    metrics: {
      total: 1,
      recentlyLearned: 1,
      highestConfidence: 91,
      mostReused: null,
      fastestGrowingDomain: "engineering",
    },
  },
  organization: {
    generatedAt: now,
    windowDays: 30,
    metrics: {
      collaborations: 2,
      completedExecutions: 8,
      blockedExecutions: 1,
      approvalFrequency: 35,
      averageCompletionHours: 4,
      objectiveCompletionRate: 80,
      activitySignals: 12,
    },
    strongestCollaboration: {
      id: "harmony+mason",
      agents: ["harmony", "mason"],
      label: "Harmony + Mason",
      total: 6,
      completed: 5,
      blocked: 1,
      approvals: 1,
      reliability: 83,
      averageDurationHours: 4,
      lastSeen: now,
    },
    highestPerformingCollaboration: null,
    mostEffectivePattern: null,
    fastestImprovingMember: null,
    bottlenecks: [
      {
        id: "approval",
        title: "Approval queue is slowing execution",
        count: 3,
        severity: "high",
        agents: ["harmony", "mason"],
        recommendation: "Clear pending reviews before starting lower-impact work.",
      },
    ],
    collaborations: [],
    workforce: [],
    planningContext: "Approval bottlenecks are recurring.",
  },
  planning: {
    current: {
      objective: "Ship Executive Workspace",
      executiveSummary: "Sequence Mason implementation, validation, and Founder review.",
      confidence: 88,
      estimatedEffort: "medium",
      phases: [],
      relevantSkills: [],
      organizationalContext: "Engineering work requires preview validation.",
      approvalCheckpoints: ["Founder review before merge"],
      recommendedWorkforce: ["harmony", "mason", "pulse"],
    },
  },
  proactiveObjectives: {
    generated: [],
    created: [],
  },
  workforceOptimization: {
    generatedAt: now,
    recommendations: [
      {
        id: "workforce_1",
        kind: "route_to_mason",
        title: "Route engineering workspace execution to Mason",
        reason: "This is code and product engineering work.",
        affectedAgents: ["harmony", "mason"],
        affectedObjectiveOrWorkType: "engineering",
        recommendedOwner: "mason",
        recommendedCollaborators: ["harmony", "pulse"],
        confidence: 91,
        expectedImpact: "Faster validated engineering delivery",
        riskLevel: "medium",
        suggestedAction: "Let Mason own implementation while Harmony keeps Founder context.",
        founderApprovalRequired: true,
        companySkillsUsed: ["Preview-first engineering delivery"],
        organizationalSignals: ["Harmony + Mason"],
      },
    ],
    strongestOpportunity: {
      id: "workforce_1",
      kind: "route_to_mason",
      title: "Route engineering workspace execution to Mason",
      reason: "This is code and product engineering work.",
      affectedAgents: ["harmony", "mason"],
      affectedObjectiveOrWorkType: "engineering",
      recommendedOwner: "mason",
      recommendedCollaborators: ["harmony", "pulse"],
      confidence: 91,
      expectedImpact: "Faster validated engineering delivery",
      riskLevel: "medium",
      suggestedAction: "Let Mason own implementation while Harmony keeps Founder context.",
      founderApprovalRequired: true,
      companySkillsUsed: ["Preview-first engineering delivery"],
      organizationalSignals: ["Harmony + Mason"],
    },
    overloadedAgents: [],
    underusedAgents: [],
    highPerformingCollaboration: null,
  },
};

describe("executive workspace", () => {
  it("covers every requested executive department", () => {
    expect(departmentNamesForWorkspace()).toEqual([
      "Executive",
      "Personal",
      "Business",
      "Finance",
      "Marketing",
      "Sales",
      "Customer Success",
      "Operations",
      "Engineering (Mason)",
      "Legal",
      "HR",
      "AI Workforce",
    ]);
  });

  it("builds an executive snapshot from reused AIOS intelligence signals", () => {
    const workspace = buildExecutiveSnapshotFromIntelligence({
      intelligence,
      departments,
      recentActivity,
      opsEvents,
    });

    expect(workspace.snapshot.companyHealth).toBe("critical");
    expect(workspace.snapshot.operationalHealth).toBe("critical");
    expect(workspace.snapshot.engineeringHealth).toBe("attention");
    expect(workspace.snapshot.criticalAlerts).toContain("Production deployment needs review");
    expect(workspace.snapshot.criticalAlerts).toContain("Approval queue is slowing execution");
    expect(workspace.snapshot.recommendedPriorities).toContain("Route engineering workspace execution to Mason");
    expect(workspace.snapshot.suggestedNextActions).toContain(
      "Let Mason own implementation while Harmony keeps Founder context.",
    );
    expect(workspace.snapshot.confidenceLevel).toBe("high");
    expect(workspace.recentExecutionHistory).toContain(
      "Mason completed preview validation for the auth shell.",
    );
    expect(workspace.productionHealthSignals).toContain("1 unresolved production error(s)");
    expect(workspace.masonEngineeringActivity).toContain(
      "2 active engineering item(s), 0 blocked",
    );
  });

  it("formats the workspace as Harmony's Founder-first operating context", () => {
    const base = buildExecutiveSnapshotFromIntelligence({
      intelligence,
      departments,
      recentActivity,
      opsEvents,
    });
    const prompt = formatExecutiveWorkspaceForPrompt({
      ...base,
      companyId: "company_1",
      promptContext: "",
    });

    expect(prompt).toContain("Executive Workspace Context");
    expect(prompt).toContain("Department awareness");
    expect(prompt).toContain("Mason engineering activity");
    expect(prompt).toContain("OIE bottlenecks");
    expect(prompt).toContain("Adaptive Planning priority");
    expect(prompt).toContain("Company Skills evolution");
    expect(prompt).toContain("Julius memory");
    expect(prompt).toContain("Production/GitHub/Vercel signals");
    expect(prompt).toContain("Operational Digital Twin");
    expect(prompt).toContain("Use this context before giving Founder recommendations");
  });
});
