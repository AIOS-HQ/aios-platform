import { describe, expect, it } from "vitest";
import { createMasonLiveExecutionPlan } from "@/lib/harmony/code/mason-live-execution";

const baseInput = {
  objective: "Fix the AIOS GitHub integration bug and open a PR",
  repository: "AIOS-HQ/aios-platform",
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

  it("creates a live GitHub and Vercel operation sequence after Founder approval", () => {
    const plan = createMasonLiveExecutionPlan({ ...baseInput, founderApproved: true });

    expect(plan.status).toBe("ready");
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "github_create_branch",
      "github_commit_file",
      "github_open_pull_request",
      "vercel_check_preview",
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
});
