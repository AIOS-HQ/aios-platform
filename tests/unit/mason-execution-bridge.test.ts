import { describe, expect, it } from "vitest";
import {
  MASON_REQUIRED_VALIDATION_COMMANDS,
  canMasonMerge,
  canMasonOpenPullRequest,
  createMasonExecutionBridge,
} from "@/lib/harmony/code/mason-execution-bridge";

const objective = "Fix the AIOS GitHub integration bug and open a PR with validation";

function bridge(overrides: Partial<Parameters<typeof createMasonExecutionBridge>[0]> = {}) {
  return createMasonExecutionBridge({
    objective,
    repository: "AIOS-HQ/aios-platform",
    requesterRole: "founder",
    founderApproved: false,
    ...overrides,
  });
}

describe("Mason execution bridge", () => {
  it("blocks subscribers from accessing Mason", () => {
    const result = bridge({ requesterRole: "subscriber", founderApproved: true });

    expect(result.provider).toBe("mason");
    expect(result.access.founderOnly).toBe(true);
    expect(result.access.subscriberFacing).toBe(false);
    expect(result.access.allowed).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.mutation.allowed).toBe(false);
  });

  it("routes engineering prompts from Harmony/AEO to Mason", () => {
    const result = bridge();

    expect(result.routedBy).toBe("harmony_aeo");
    expect(result.scopedPlan.engineeringPromptRoutesToMason).toBe(true);
    expect(result.runtimePlan.provider).toBe("mason");
    expect(result.runtimePlan.classification.shouldRouteToMason).toBe(true);
  });

  it("requires Founder approval before mutation or PR-opening execution", () => {
    const pending = bridge({ founderApproved: false });
    const approved = bridge({ founderApproved: true });

    expect(pending.status).toBe("paused_for_founder_approval");
    expect(pending.mutation.allowed).toBe(false);
    expect(canMasonOpenPullRequest(pending)).toBe(false);
    expect(approved.status).toBe("ready");
    expect(approved.mutation.allowed).toBe(true);
    expect(canMasonOpenPullRequest(approved)).toBe(true);
  });

  it("enforces branch and PR boundaries", () => {
    const result = bridge({ founderApproved: true, branchName: "mason/fix-github-integration" });

    expect(result.scopedPlan.baseBranch).toBe("main");
    expect(result.scopedPlan.branchName).toBe("mason/fix-github-integration");
    expect(result.mutation.branchRequired).toBe(true);
    expect(result.mutation.productionDirectEditAllowed).toBe(false);
    expect(result.mutation.destructiveActionsAllowed).toBe(false);
    expect(result.pullRequest.required).toBe(true);
    expect(result.pullRequest.canOpen).toBe(true);
  });

  it("keeps merge approval-gated even after Founder-approved implementation", () => {
    const result = bridge({ founderApproved: true });

    expect(result.mergePolicy.founderApprovalRequired).toBe(true);
    expect(result.mergePolicy.masonCanMergeWithoutApproval).toBe(false);
    expect(result.mergePolicy.mergeAllowedNow).toBe(false);
    expect(canMasonMerge(result)).toBe(false);
  });

  it("requires the full AIOS validation command set", () => {
    const result = bridge();

    expect(result.validation.commands).toEqual(MASON_REQUIRED_VALIDATION_COMMANDS);
    expect(result.validation.commands).toEqual([
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run i18n:check",
      "npm run build",
    ]);
  });

  it("reports execution state back to Activity, Review Queue, Outcomes, Julius, and Company Skills", () => {
    const result = bridge();

    expect(result.reporting.targets).toEqual(["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"]);
    expect(result.reporting.updatesActivity).toBe(true);
    expect(result.reporting.updatesReviewQueue).toBe(true);
    expect(result.reporting.updatesOutcomes).toBe(true);
    expect(result.reporting.updatesJulius).toBe(true);
    expect(result.reporting.updatesCompanySkills).toBe(true);
    expect(result.runtimePlan.memoryPlan.evolveCompanySkills).toBe(true);
  });
});
