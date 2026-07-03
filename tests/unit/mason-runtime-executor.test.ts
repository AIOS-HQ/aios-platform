import { describe, expect, it, vi } from "vitest";
import {
  executeMasonRuntimePlan,
  type MasonRuntimeExecutorAdapters,
} from "@/lib/harmony/code/mason-runtime-executor";

function adapters(): MasonRuntimeExecutorAdapters {
  return {
    github: {
      createBranch: vi.fn(async () => ({ branch: "mason/fix-runtime" })),
      commitFile: vi.fn(async () => ({ commitSha: "commit-123" })),
      openPullRequest: vi.fn(async () => ({ url: "https://github.com/AIOS-HQ/aios-platform/pull/999" })),
    },
    vercel: {
      inspectPreview: vi.fn(async () => ({ previewUrl: "https://preview.example.vercel.app" })),
    },
    harmony: {
      requestValidation: vi.fn(async () => ({ requested: true })),
      reportOutcome: vi.fn(async () => ({ reported: true })),
      recordActivity: vi.fn(async () => ({ recorded: true })),
      updateReviewQueue: vi.fn(async () => ({ queued: true })),
      updateJuliusMemory: vi.fn(async () => ({ remembered: true })),
      updateCompanySkills: vi.fn(async () => ({ learned: true })),
    },
  };
}

const baseInput = {
  objective: "Fix the AIOS GitHub integration bug and open a PR",
  repository: "AIOS-HQ/aios-platform",
  founderApproved: true,
  branchName: "mason/fix-runtime",
  fileChanges: [
    {
      path: "src/lib/example.ts",
      content: "export const example = true;\n",
      message: "Mason scoped runtime update",
    },
  ],
};

describe("Mason runtime executor", () => {
  it("executes approved GitHub, validation, Vercel, and Harmony operations in order", async () => {
    const runtimeAdapters = adapters();
    // Intent-driven behavior: the PR + Vercel preview operations exist only when
    // the caller explicitly requests a pull request (openPullRequest: true).
    const result = await executeMasonRuntimePlan(
      { ...baseInput, openPullRequest: true },
      runtimeAdapters,
    );

    expect(result.status).toBe("completed");
    expect(result.results.map((item) => item.operation.kind)).toEqual([
      "github_create_branch",
      "github_commit_file",
      "validation_request",
      "github_open_pull_request",
      "vercel_check_preview",
      "harmony_report_outcome",
      "activity_record",
      "review_queue_update",
      "julius_memory_update",
      "company_skill_update",
    ]);
    expect(runtimeAdapters.github.createBranch).toHaveBeenCalledWith({
      repository: "AIOS-HQ/aios-platform",
      branch: "mason/fix-runtime",
      base: "main",
    });
    expect(runtimeAdapters.github.commitFile).toHaveBeenCalledWith({
      repository: "AIOS-HQ/aios-platform",
      branch: "mason/fix-runtime",
      path: "src/lib/example.ts",
      content: "export const example = true;\n",
      message: "Mason scoped runtime update",
    });
    expect(runtimeAdapters.harmony.requestValidation).toHaveBeenCalledWith({
      repository: "AIOS-HQ/aios-platform",
      branch: "mason/fix-runtime",
      commands: ["npm run lint", "npm run typecheck", "npm test", "npm run i18n:check", "npm run build"],
    });
    expect(result.pullRequestUrl).toBe("https://github.com/AIOS-HQ/aios-platform/pull/999");
    expect(result.previewUrl).toBe("https://preview.example.vercel.app");
  });

  it("blocks runtime execution until Founder approval exists", async () => {
    const runtimeAdapters = adapters();
    const result = await executeMasonRuntimePlan({ ...baseInput, founderApproved: false }, runtimeAdapters);

    expect(result.status).toBe("blocked");
    expect(result.results).toEqual([]);
    expect(runtimeAdapters.github.createBranch).not.toHaveBeenCalled();
    expect(result.summary).toContain("Founder approval");
  });

  it("blocks subscriber runtime execution", async () => {
    const runtimeAdapters = adapters();
    const result = await executeMasonRuntimePlan({ ...baseInput, requesterRole: "subscriber" }, runtimeAdapters);

    expect(result.status).toBe("blocked");
    expect(result.results).toEqual([]);
    expect(runtimeAdapters.github.createBranch).not.toHaveBeenCalled();
  });

  it("stops execution when a connector adapter fails", async () => {
    const runtimeAdapters = adapters();
    vi.mocked(runtimeAdapters.github.commitFile).mockRejectedValueOnce(new Error("GitHub file write failed"));

    const result = await executeMasonRuntimePlan(baseInput, runtimeAdapters);

    expect(result.status).toBe("failed");
    expect(result.results.map((item) => item.operation.kind)).toEqual(["github_create_branch", "github_commit_file"]);
    expect(result.results[1].error).toBe("GitHub file write failed");
    expect(runtimeAdapters.github.openPullRequest).not.toHaveBeenCalled();
  });

  it("never exposes merge execution through the runtime plan", async () => {
    const result = await executeMasonRuntimePlan(baseInput, adapters());

    expect(result.results.map((item) => item.operation.capabilityId)).not.toContain("merge_pull_request");
    expect(result.plan.bridge.mergePolicy.mergeAllowedNow).toBe(false);
  });
});
