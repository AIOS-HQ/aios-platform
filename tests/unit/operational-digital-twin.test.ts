import { describe, expect, it } from "vitest";
import {
  buildOperationalDigitalTwinFromSignals,
  formatOperationalDigitalTwinForPrompt,
} from "@/lib/harmony/operational-digital-twin";
import type { ExecutiveWorkspace } from "@/lib/harmony/executive-workspace";
import type { ActivityEvent } from "@/types/database";
import type { OpsEvent } from "@/lib/observability/ops";

const now = "2026-06-28T00:00:00.000Z";

function workspace(): ExecutiveWorkspace {
  return {
    generatedAt: now,
    companyId: "company_1",
    snapshot: {
      companyHealth: "healthy",
      operationalHealth: "attention",
      engineeringHealth: "healthy",
      aiWorkforceHealth: "healthy",
      criticalAlerts: [],
      recommendedPriorities: ["Review production readiness"],
      suggestedNextActions: ["Verify deployment health before launch."],
      confidenceLevel: "high",
    },
    departments: [],
    intelligence: {
      generatedAt: now,
      situation: "operating",
      headline: { key: "operating", primaryCount: 1 },
      metrics: {
        activeObjectives: 2,
        activeWork: 3,
        blockedWork: 0,
        pendingApprovals: 1,
        failedExecutions: 0,
        openRecommendations: 1,
        connectorIssues: 0,
        activeAgents: 5,
        completedToday: 2,
        juliusContext: 2,
      },
      recommendations: [],
      delegationRoutes: [],
      workforce: [],
      connectors: [],
      auditor: { report: { generatedAt: now, findings: [] } as never, risks: [], warnings: [], frequencyByDomain: [] },
      julius: { total: 2, recent: [], decisions: [], lessons: [] },
      skills: {
        relevant: [{ title: "Launch readiness pattern" } as never],
        metrics: {
          total: 4,
          recentlyLearned: 1,
          highestConfidence: 92,
          mostReused: null,
          fastestGrowingDomain: "operations",
        },
      },
      organization: {
        generatedAt: now,
        windowDays: 30,
        metrics: {
          collaborations: 2,
          completedExecutions: 9,
          blockedExecutions: 0,
          approvalFrequency: 20,
          averageCompletionHours: 4,
          objectiveCompletionRate: 82,
          activitySignals: 12,
        },
        strongestCollaboration: {
          id: "harmony+pulse",
          agents: ["harmony", "pulse"],
          label: "Harmony + Pulse",
          total: 5,
          completed: 5,
          blocked: 0,
          approvals: 1,
          reliability: 100,
          averageDurationHours: 3,
          lastSeen: now,
        },
        highestPerformingCollaboration: null,
        mostEffectivePattern: {
          id: "launch-readiness",
          title: "Launch readiness checks",
          detail: "Validate production and approvals before launch.",
          confidence: 88,
          agents: ["harmony", "pulse"],
        },
        fastestImprovingMember: null,
        bottlenecks: [],
        collaborations: [],
        workforce: [],
        planningContext: "Production launches benefit from deployment-first validation.",
      },
      planning: {
        current: {
          objective: "Launch readiness",
          executiveSummary: "Confirm health, approvals, and deployment status.",
          confidence: 88,
          estimatedEffort: "medium",
          phases: [],
          relevantSkills: [],
          organizationalContext: "Use launch pattern.",
          approvalCheckpoints: ["Founder release approval"],
          recommendedWorkforce: ["harmony", "pulse"],
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
    recentExecutionHistory: ["Harmony prepared launch validation."],
    productionHealthSignals: ["Connected services report no critical connector issues"],
    masonEngineeringActivity: ["No active Mason work queue signal"],
    operationalDigitalTwin: null as never,
    promptContext: "",
  };
}

const activity: ActivityEvent[] = [
  {
    id: "activity_1",
    user_id: "user_1",
    company_id: "company_1",
    department_id: null,
    actor_type: "agent",
    actor_id: "pulse",
    kind: "agent_action",
    summary: "Pulse verified production readiness.",
    ref_type: null,
    ref_id: null,
    created_at: now,
  },
];

const ops: OpsEvent[] = [
  {
    id: "ops_1",
    user_id: "user_1",
    company_id: "company_1",
    level: "warn",
    source: "deployment",
    message: "Preview needs final Founder validation.",
    context: {},
    resolved: false,
    created_at: now,
  },
];

describe("operational digital twin", () => {
  it("builds a launch-aware twin from existing intelligence and operational systems", () => {
    const twin = buildOperationalDigitalTwinFromSignals({
      workspace: workspace(),
      activity,
      opsEvents: ops,
      github: {
        ok: true,
        data: { runs: [{ name: "Vercel", status: "completed", conclusion: "success" }] },
      },
      vercel: {
        connected: true,
        items: [
          { id: "deployment_status", ok: true, detail: "READY" },
          { id: "build_status", ok: true, detail: "latest build READY" },
        ],
      },
    });

    expect(twin.health).toBe("attention");
    expect(twin.systems.map((signal) => signal.id)).toEqual([
      "executive_workspace",
      "oie",
      "company_skills",
      "aeo",
    ]);
    expect(twin.deploymentAwareness.map((signal) => signal.id)).toEqual([
      "github",
      "vercel",
      "ops_events",
    ]);
    expect(twin.launchReadiness.status).toBe("needs_attention");
    expect(twin.founderRecommendations.some((rec) => rec.reusedSystem === "Activity Events and Ops Events")).toBe(true);
    expect(twin.longitudinalIntelligence).toContain(
      "Production launches benefit from deployment-first validation.",
    );
  });

  it("surfaces deployment blockers and prompt context for Harmony", () => {
    const twin = buildOperationalDigitalTwinFromSignals({
      workspace: workspace(),
      activity,
      opsEvents: [{ ...ops[0], level: "error", message: "Production deployment failed." }],
      github: {
        ok: true,
        data: { runs: [{ name: "Build", status: "completed", conclusion: "failure" }] },
      },
      vercel: {
        connected: true,
        items: [{ id: "build_status", ok: false, detail: "state: ERROR" }],
      },
    });
    const prompt = formatOperationalDigitalTwinForPrompt(twin);

    expect(twin.health).toBe("critical");
    expect(twin.launchReadiness.status).toBe("blocked");
    expect(twin.launchReadiness.blockers).toContain("Production deployment failed.");
    expect(prompt).toContain("Operational Digital Twin");
    expect(prompt).toContain("Deployment awareness");
    expect(prompt).toContain("Founder recommendations");
  });
});
