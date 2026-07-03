import { describe, expect, it } from "vitest";
import {
  masonActionForOperation,
  classifyMasonOperation,
  evaluateMasonOperationGate,
  resolveMasonOperationApproval,
} from "@/lib/harmony/autonomy/mason-policy";
import { createMasonLiveExecutionPlan } from "@/lib/harmony/code/mason-live-execution";

describe("Mason ↔ Unified Autonomy Policy Engine bridge", () => {
  it("maps Mason runtime operations to engine action types", () => {
    expect(masonActionForOperation("github_create_branch", "create_branch")).toBe("create_branch");
    expect(masonActionForOperation("github_commit_file", "commit_file_to_branch")).toBe("commit_file");
    expect(masonActionForOperation("github_open_pull_request", "open_pull_request")).toBe("open_pull_request");
    expect(masonActionForOperation("github_create_issue", "create_issue")).toBe("create_issue");

    // Internal orchestration operations are not governed engineering actions.
    expect(masonActionForOperation("vercel_check_preview", "deployment_status")).toBeNull();
    expect(masonActionForOperation("review_queue_update", "update_review_queue")).toBeNull();

    // High-risk hints win regardless of the operation kind.
    expect(masonActionForOperation("github_open_pull_request", "merge_pull_request")).toBe("merge_pull_request");
    expect(masonActionForOperation("github_commit_file", "delete_repository")).toBe("delete_repository");
  });

  it("classifies routine, approval, and destructive actions from the engine risk map", () => {
    expect(classifyMasonOperation("github_create_branch", "create_branch")).toMatchObject({
      governed: true,
      risk: "routine",
      requiresApproval: false,
      destructive: false,
      allowedForMason: true,
    });
    expect(classifyMasonOperation("github_open_pull_request", "merge_pull_request")).toMatchObject({
      action: "merge_pull_request",
      risk: "approval",
      requiresApproval: true,
      destructive: false,
      allowedForMason: true,
    });
    expect(classifyMasonOperation("github_commit_file", "delete_repository")).toMatchObject({
      action: "delete_repository",
      risk: "destructive",
      destructive: true,
      allowedForMason: false,
    });
    expect(classifyMasonOperation("vercel_check_preview", "deployment_status")).toMatchObject({
      governed: false,
      requiresApproval: false,
      allowedForMason: true,
    });
  });

  it("gates execution: approved routine runs; unapproved mutation, merge, and destructive are blocked", () => {
    expect(
      evaluateMasonOperationGate({ kind: "github_create_branch", capabilityId: "create_branch", approved: true }).allow,
    ).toBe(true);

    // Routine mutation still requires an approved scope.
    expect(
      evaluateMasonOperationGate({ kind: "github_create_branch", capabilityId: "create_branch", approved: false }).allow,
    ).toBe(false);

    // Merge is approval-class — blocked until approved.
    expect(
      evaluateMasonOperationGate({ kind: "github_open_pull_request", capabilityId: "merge_pull_request", approved: false }).allow,
    ).toBe(false);

    // Destructive/forbidden actions are blocked even when marked approved.
    expect(
      evaluateMasonOperationGate({ kind: "github_commit_file", capabilityId: "delete_repository", approved: true }).allow,
    ).toBe(false);

    // Internal orchestration always passes.
    expect(
      evaluateMasonOperationGate({ kind: "review_queue_update", capabilityId: "update_review_queue", approved: false }).allow,
    ).toBe(true);
  });

  it("resolves scope approval without auto-approving high-risk actions", () => {
    expect(resolveMasonOperationApproval("github_create_branch", "create_branch", false, true)).toBe(true);
    expect(resolveMasonOperationApproval("github_create_branch", "create_branch", false, false)).toBe(false);
    expect(resolveMasonOperationApproval("github_open_pull_request", "merge_pull_request", true, true)).toBe(false);
    expect(resolveMasonOperationApproval("github_commit_file", "delete_repository", true, true)).toBe(false);
    expect(resolveMasonOperationApproval("review_queue_update", "update_review_queue", true, true)).toBe(true);
  });

  it("keeps the live execution plan consistent with the central engine gate", () => {
    const plan = createMasonLiveExecutionPlan({
      objective: "Fix the AIOS GitHub integration bug and open a PR",
      repository: "AIOS-HQ/aios-platform",
      founderApproved: true,
      openPullRequest: true,
      branchName: "mason/fix-github-integration",
      fileChanges: [{ path: "src/lib/example.ts", content: "export const example = true;\n" }],
    });

    expect(plan.status).toBe("ready");

    // Every emitted operation must be permitted by the central engine gate,
    // proving mason-live-execution and mason-runtime-executor share one policy.
    for (const operation of plan.operations) {
      const gate = evaluateMasonOperationGate({
        kind: operation.kind,
        capabilityId: operation.capabilityId,
        approved: operation.approved,
      });
      expect(gate.allow).toBe(true);
    }

    // No forbidden/destructive operation is ever emitted by the planner.
    expect(
      plan.operations.every((o) => classifyMasonOperation(o.kind, o.capabilityId).allowedForMason),
    ).toBe(true);
    expect(plan.operations.some((o) => o.capabilityId.includes("delete"))).toBe(false);
  });
});
