import { describe, expect, it } from "vitest";
import {
  availablePlanningAgents,
  buildAdaptivePlanFromSignals,
} from "@/lib/harmony/adaptive-planning";
import {
  getAgentConnectors,
  getAiosAgent,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";
import type { OrganizationalIntelligence } from "@/lib/organizational-intelligence/engine";

describe("AIOS workforce registry", () => {
  it("registers Mason as the Founder-only engineering specialist", () => {
    const mason = getAiosAgent("mason");

    expect(mason?.name).toBe("Mason");
    expect(mason?.role).toBe("Founder Native Chief Software Engineer");
    expect(mason?.responsibilities.join(" ")).toContain("pull request");
    expect(isFounderOnlyAgent("mason")).toBe(true);
    expect(isFounderOnlyAgent("harmony")).toBe(false);
    expect(getAgentConnectors("mason")).toEqual(["github", "vercel"]);
  });

  it("makes Mason available to Harmony planning for engineering objectives", () => {
    expect(availablePlanningAgents()).toContain("mason");

    const organization: OrganizationalIntelligence = {
      totalCompleted: 0,
      totalBlocked: 0,
      totalApprovals: 0,
      averageCompletionHours: null,
      recurringBottlenecks: [],
      strongestCollaboration: null,
      frequentObjectivePatterns: [],
      reliabilityScore: 0,
      recommendations: [],
    };

    const plan = buildAdaptivePlanFromSignals({
      title: "Fix the login page React component and open a GitHub PR",
      detail: "Create a branch, implement the UI bug fix, test it, and prepare a Vercel preview.",
      skills: [],
      organization,
    });

    expect(plan.recommendedWorkforce).toContain("mason");
    expect(plan.phases.some((phase) => phase.recommendedAgent === "mason")).toBe(true);
    expect(plan.approvalCheckpoints).toContain("Engineering Implementation");
  });
});
