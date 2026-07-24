import { describe, expect, it } from "vitest";
import { createMasonLiveExecutionPlan } from "@/lib/harmony/code/mason-live-execution";

const baseInput = {
  objective: "Fix the AIOS GitHub integration bug and open a PR",
  repository: "AIOS-HQ/aios-platform",
  requesterRole: "founder" as const,
  requestedOutcome: "open_pull_request" as const,
  branchName: "mason/fix-github-integration",
  fileChanges: [
    {
      path: "src/lib/example.ts",
      content: "export const example = true;\n",
      message: "Mason scoped example update",
    },
  ],
};

describe("Mason live execution planner", () => {
  it("pauses live GitHub mutations until Founder approval exists", () => {
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: false });

    expect(plan.status).toBe("approval_required");
    expect(plan.operations).toEqual([]);
    expect(plan.blockedReason).toContain("Founder approval");
    expect(plan.bridge.mutation.allowed).toBe(false);
  });

  it("blocks subscriber access to Mason live execution", () => {
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: true, requesterRole: "subscriber" });

    expect(plan.status).toBe("blocked");
    expect(plan.operations).toEqual([]);
    expect(plan.bridge.access.allowed).toBe(false);
    expect(plan.blockedReason).toContain("access");
  });

  it("creates a live GitHub, validation, Vercel, and reporting operation sequence after Founder approval", () => {
    // Intent-driven behavior: PR + Vercel preview operations require an explicit
    // openPullRequest request; branch/commit remain routine under Founder scope.
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: true, openPullRequest: true });

    expect(plan.status).toBe("ready");
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "github_create_branch",
      "github_commit_file",
      "validation_request",
      "github_open_pull_request",
      "vercel_check_preview",
      "harmony_report_outcome",
      "activity_record",
    ]);
    expect(plan.operations[0].params).toMatchObject({
      repo: "AIOS-HQ/aios-platform",
      branch: "mason/fix-github-integration",
      base: "main",
    });
    expect(plan.operations[1].params).toMatchObject({
      path: "src/lib/example.ts",
      branch: "mason/fix-github-integration",
    });
  });

  it("includes PR validation requests and keeps merge blocked", () => {
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: true });

    expect(plan.validationCommands).toEqual([
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run i18n:check",
      "npm run build",
    ]);
    expect(plan.operations.find((operation) => operation.kind === "validation_request")?.params).toMatchObject({
      commands: plan.validationCommands,
      branch: "mason/fix-github-integration",
    });
    expect(plan.prBody).toContain("## Validation requested");
    expect(plan.prBody).toContain("Mason cannot merge this PR");
    expect(plan.bridge.mergePolicy.mergeAllowedNow).toBe(false);
  });

  it("does not create merge or destructive operations", () => {
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: true });

    expect(plan.operations.map((operation) => operation.capabilityId)).not.toContain("merge_pull_request");
    expect(plan.operations.some((operation) => operation.capabilityId.includes("repository"))).toBe(false);
    expect(plan.bridge.mutation.destructiveActionsAllowed).toBe(false);
  });

  it("reports Activity/Outcomes while policy and closed-loop own Review Queue and learning", () => {
    const plan = createMasonLiveExecutionPlan({
      ...baseInput,
      founderApproved: true,
      openPullRequest: true,
      pullRequestUrl: "PR-999",
      vercelPreviewUrl: "preview-ready",
    });

    expect(plan.reportingTargets).toEqual(["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"]);
    expect(plan.outcomeSummary).toContain("PR-999");
    expect(plan.outcomeSummary).toContain("preview-ready");
    expect(plan.operations.map((operation) => operation.capabilityId)).toEqual(
      expect.arrayContaining(["report_mason_execution_outcome", "emit_activity"]),
    );
    expect(plan.operations.map((operation) => operation.capabilityId)).not.toEqual(
      expect.arrayContaining(["update_review_queue", "update_julius_memory", "update_company_skills"]),
    );
  });
});
