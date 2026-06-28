import { describe, expect, it } from "vitest";
import {
  createMasonLiveExecutionWiring,
  getReadyMasonLiveActions,
} from "@/lib/harmony/code/mason-live-execution";

const objective = "Fix the AIOS GitHub connector bug, edit files, validate, and open a PR";

function wiring(overrides: Partial<Parameters<typeof createMasonLiveExecutionWiring>[0]> = {}) {
  return createMasonLiveExecutionWiring({
    objective,
    repository: "AIOS-HQ/aios-platform",
    requesterRole: "founder",
    founderApproved: true,
    branchName: "mason/fix-github-connector",
    filePatches: [{ path: "src/lib/example.ts", operation: "update", summary: "Patch connector bug" }],
    ...overrides,
  });
}

describe("Mason live execution wiring", () => {
  it("wires Founder-approved work to live GitHub branch, file, PR, validation, Vercel, and reporting actions", () => {
    const result = wiring();

    expect(result.status).toBe("ready_for_live_execution");
    expect(result.github.repository).toBe("AIOS-HQ/aios-platform");
    expect(result.github.baseBranch).toBe("main");
    expect(result.github.executionBranch).toBe("mason/fix-github-connector");
    expect(result.github.canCreateBranch).toBe(true);
    expect(result.github.canEditFiles).toBe(true);
    expect(result.github.canOpenPullRequest).toBe(true);
    expect(result.validation.canRequestValidation).toBe(true);
    expect(result.vercel.canInspectPreview).toBe(true);
    expect(result.reporting.canReportOutcome).toBe(true);
    expect(getReadyMasonLiveActions(result).map((action) => action.kind)).toEqual(
      expect.arrayContaining([
        "github.create_branch",
        "github.update_file",
        "validation.request",
        "github.create_pull_request",
        "vercel.inspect_preview",
        "harmony.report_outcome",
      ]),
    );
  });

  it("pauses all mutation actions until Founder approval", () => {
    const result = wiring({ founderApproved: false });

    expect(result.status).toBe("paused_for_founder_approval");
    expect(result.github.canCreateBranch).toBe(false);
    expect(result.github.canEditFiles).toBe(false);
    expect(result.github.canOpenPullRequest).toBe(false);
    expect(result.actions.find((action) => action.kind === "github.create_branch")?.status).toBe("blocked");
    expect(result.actions.find((action) => action.kind === "github.create_pull_request")?.status).toBe("blocked");
  });

  it("blocks subscriber access to live execution wiring", () => {
    const result = wiring({ requesterRole: "subscriber" });

    expect(result.status).toBe("blocked");
    expect(result.bridge.access.allowed).toBe(false);
    expect(result.github.canCreateBranch).toBe(false);
    expect(result.github.canEditFiles).toBe(false);
    expect(result.reporting.canReportOutcome).toBe(false);
  });

  it("keeps Vercel preview inspection required before merge approval", () => {
    const result = wiring({ vercelPreviewUrl: "https://aios-platform-git-mason.vercel.app" });

    expect(result.vercel.previewUrl).toBe("https://aios-platform-git-mason.vercel.app");
    expect(result.vercel.requiresPreviewBeforeMerge).toBe(true);
    expect(result.bridge.mergePolicy.mergeAllowedNow).toBe(false);
  });

  it("builds a PR body with file patches, validation commands, risks, and Founder approval note", () => {
    const result = wiring({
      validationResults: {
        "npm run lint": "passed",
        "npm run typecheck": "passed",
        "npm test": "passed",
        "npm run i18n:check": "passed",
        "npm run build": "passed",
      },
    });

    expect(result.github.pullRequestBody).toContain("## Files changed");
    expect(result.github.pullRequestBody).toContain("src/lib/example.ts");
    expect(result.github.pullRequestBody).toContain("npm run build: passed");
    expect(result.github.pullRequestBody).toContain("Merge remains blocked until explicit Founder approval");
    expect(result.validation.allRequiredCommandsAccountedFor).toBe(true);
  });

  it("reports outcomes to Activity, Review Queue, Outcomes, Julius, and Company Skills", () => {
    const result = wiring({ pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/999" });

    expect(result.reporting.targets).toEqual(["Activity", "Review Queue", "Outcomes", "Julius", "Company Skills"]);
    expect(result.reporting.outcomeSummary).toContain("https://github.com/AIOS-HQ/aios-platform/pull/999");
  });
});
