import { describe, expect, it } from "vitest";
import {
  appendAdaptivePlan,
  buildAdaptivePlanFromSignals,
  formatAdaptivePlan,
} from "@/lib/harmony/adaptive-planning";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";
import type { SkillUsageEvidence } from "@/lib/company-skills/utilization";

const skill: SkillUsageEvidence = {
  id: "security:launch-approval",
  title: "Launch approval checklist",
  owner_agent: "aegis",
  category: "governance",
  confidence_score: 84,
  success_count: 5,
  failure_count: 1,
  approval_requirement: "required",
  summary: "Review launch permissions and approval records.",
  reusable_solution: "Confirm risk, owner, approval checkpoint, and rollback path before launch.",
  reason: "matched launch approval; confidence 84/100 after 5 success(es)",
  source_entry_id: "julius_1",
};

const organization: OrganizationalIntelligence = {
  generatedAt: "2026-06-27T00:00:00.000Z",
  windowDays: 30,
  metrics: {
    collaborations: 1,
    completedExecutions: 4,
    blockedExecutions: 1,
    approvalFrequency: 20,
    averageCompletionHours: 4,
    objectiveCompletionRate: 80,
    activitySignals: 6,
  },
  strongestCollaboration: {
    id: "aegis+harmony",
    agents: ["aegis", "harmony"],
    label: "Aegis + Harmony",
    total: 5,
    completed: 4,
    blocked: 1,
    approvals: 1,
    reliability: 80,
    averageDurationHours: 4,
    lastSeen: "2026-06-27T00:00:00.000Z",
  },
  highestPerformingCollaboration: null,
  mostEffectivePattern: null,
  fastestImprovingMember: null,
  bottlenecks: [],
  collaborations: [],
  workforce: [],
  planningContext: "Strongest collaboration: Aegis + Harmony.",
};

describe("adaptive planning", () => {
  it("builds ordered phases from objective, skills, and organizational intelligence", () => {
    const plan = buildAdaptivePlanFromSignals({
      title: "Launch production security review",
      detail: "Prepare production approval and validation before deployment.",
      skills: [skill],
      organization,
    });

    expect(plan.phases.length).toBeGreaterThanOrEqual(3);
    expect(plan.recommendedWorkforce).toContain("harmony");
    expect(plan.recommendedWorkforce).toContain("aegis");
    expect(plan.approvalCheckpoints.length).toBeGreaterThan(0);
    expect(plan.confidence).toBeGreaterThan(50);
  });

  it("formats and appends executive planning context", () => {
    const plan = buildAdaptivePlanFromSignals({
      title: "Launch production security review",
      detail: "Prepare production approval and validation before deployment.",
      skills: [skill],
      organization,
    });

    expect(formatAdaptivePlan(plan)).toContain("Adaptive Execution Plan");
    expect(formatAdaptivePlan(plan)).toContain("Company Skills used");
    expect(appendAdaptivePlan("Existing context", plan)).toContain("Existing context");
  });
});
