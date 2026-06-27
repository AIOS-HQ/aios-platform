import { describe, expect, it } from "vitest";
import { buildWorkforceOptimization } from "@/lib/harmony/workforce-optimization";
import type { CompanySkill } from "@/lib/company-skills/library";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";
import type { AgentObjective } from "@/lib/workforce/objectives";
import type { WorkItem } from "@/lib/workforce/work-queue";

const now = "2026-06-27T00:00:00.000Z";

const organization: OrganizationalIntelligence = {
  generatedAt: now,
  windowDays: 30,
  metrics: {
    collaborations: 2,
    completedExecutions: 8,
    blockedExecutions: 2,
    approvalFrequency: 35,
    averageCompletionHours: 5,
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
  highestPerformingCollaboration: {
    id: "mason+pulse",
    agents: ["mason", "pulse"],
    label: "Mason + Pulse",
    total: 4,
    completed: 4,
    blocked: 0,
    approvals: 1,
    reliability: 100,
    averageDurationHours: 3,
    lastSeen: now,
  },
  mostEffectivePattern: {
    id: "engineering-validation",
    title: "Engineering validation pattern",
    detail: "Preview validation works well before merge.",
    confidence: 86,
    agents: ["mason", "pulse"],
  },
  fastestImprovingMember: null,
  bottlenecks: [
    {
      id: "approval",
      title: "approval bottleneck",
      count: 3,
      severity: "high",
      agents: ["ledger", "harmony"],
      recommendation: "Clarify repeat approval criteria before execution.",
    },
  ],
  collaborations: [
    {
      id: "auditor+catalyst",
      agents: ["auditor", "catalyst"],
      label: "Auditor + Catalyst",
      total: 3,
      completed: 1,
      blocked: 2,
      approvals: 0,
      reliability: 33,
      averageDurationHours: 12,
      lastSeen: now,
    },
  ],
  workforce: [],
  planningContext: "Approval bottlenecks are recurring.",
};

const engineeringSkill: CompanySkill = {
  id: "skill_1",
  title: "Preview-first engineering delivery",
  owner_agent: "mason",
  category: "engineering",
  summary: "Use branch, tests, PR, and preview validation.",
  business_problem: "Engineering work needs safe release boundaries.",
  reusable_solution: "Inspect, patch, validate, open PR, and wait for Founder approval.",
  prerequisites: ["GitHub and Vercel connectors"],
  when_to_use: ["Code changes", "Deployment preparation"],
  approval_requirement: "required",
  confidence_score: 91,
  success_count: 6,
  failure_count: 1,
  last_used: now,
  created_from_objective: null,
  updated_at: now,
  source_entry_id: "entry_1",
};

function objective(overrides: Partial<AgentObjective>): AgentObjective {
  return {
    id: "objective_1",
    user_id: "user_1",
    company_id: "company_1",
    agent: "horizon",
    title: "Build API integration test coverage",
    detail: "Improve GitHub connector tests and deployment validation.",
    status: "active",
    priority: "high",
    origin: "founder",
    progress: 10,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function workItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: "work_1",
    user_id: "user_1",
    company_id: "company_1",
    agent: "auditor",
    objective_id: null,
    title: "Inspect validation failure",
    detail: null,
    kind: "task",
    risk: "routine",
    status: "in_progress",
    autonomy: "advisory",
    requires_approval: true,
    risk_level: "low",
    category: "quality",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("workforce optimization", () => {
  it("routes engineering work to Mason through Founder-reviewable recommendations", () => {
    const summary = buildWorkforceOptimization({
      work: [],
      objectives: [objective({})],
      companySkills: [engineeringSkill],
      organization,
      adaptivePlan: null,
    });

    const masonRoute = summary.recommendations.find((rec) => rec.kind === "route_to_mason");

    expect(masonRoute).toBeDefined();
    expect(masonRoute?.recommendedOwner).toBe("mason");
    expect(masonRoute?.founderApprovalRequired).toBe(true);
    expect(masonRoute?.affectedObjectiveOrWorkType).toContain("engineering");
    expect(masonRoute?.companySkillsUsed).toContain("Preview-first engineering delivery");
  });

  it("detects overloaded agents and keeps rebalancing gated by Founder review", () => {
    const summary = buildWorkforceOptimization({
      work: [
        workItem({ id: "work_1", agent: "auditor" }),
        workItem({ id: "work_2", agent: "auditor", title: "Review regression risk" }),
        workItem({ id: "work_3", agent: "auditor", title: "Inspect failing checks" }),
      ],
      objectives: [objective({ id: "objective_2", agent: "auditor", title: "Audit release workflow" })],
      companySkills: [],
      organization,
      adaptivePlan: null,
    });

    const rebalance = summary.recommendations.find((rec) => rec.kind === "rebalance_workload");

    expect(summary.overloadedAgents).toContain("auditor");
    expect(rebalance?.affectedAgents).toContain("auditor");
    expect(rebalance?.recommendedOwner).toBe("harmony");
    expect(rebalance?.founderApprovalRequired).toBe(true);
  });

  it("surfaces strong and weak collaboration patterns from OIE signals", () => {
    const summary = buildWorkforceOptimization({
      work: [],
      objectives: [],
      companySkills: [engineeringSkill],
      organization,
      adaptivePlan: null,
    });

    expect(summary.highPerformingCollaboration?.agents).toEqual(["mason", "pulse"]);
    expect(summary.recommendations.some((rec) => rec.kind === "reuse_high_performing_collaboration")).toBe(true);
    expect(summary.recommendations.some((rec) => rec.kind === "avoid_unreliable_collaboration")).toBe(true);
  });
});
