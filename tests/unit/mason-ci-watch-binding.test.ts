import { describe, expect, it } from "vitest";
import { classifyCiEvidenceBinding, type CiObservedCheck, type CiWatchSample } from "@/lib/workforce/mason-ci-watch";
import { defaultMasonValidationRequirements, getGithubCheckAliasesForRequirements } from "@/lib/harmony/code/mason-validation-policy";

function baseSample(): CiWatchSample {
  return {
    status: "pending",
    requiredChecksPassed: false,
    headSha: "sha-1",
    repository: "AIOS-HQ/aios-platform",
    prNumber: 42,
    branch: "mason/test",
    observedAt: new Date().toISOString(),
    terminalValidationState: "running",
  };
}

function checks(overrides: Partial<CiObservedCheck> = {}): CiObservedCheck[] {
  return [
    {
      name: "npm run lint",
      status: "completed",
      conclusion: "success",
      headSha: "sha-1",
      branch: "mason/test",
      repository: "AIOS-HQ/aios-platform",
      prNumber: 42,
      workflowId: "wf-1",
      checkId: "check-1",
      source: "workflow_run",
      observedAt: new Date().toISOString(),
      ...overrides,
    },
  ];
}

describe("mason ci binding classification", () => {
  it("accepts exact repository/PR/branch/head/check evidence", () => {
    const result = classifyCiEvidenceBinding(
      baseSample(),
      {
        repository: "AIOS-HQ/aios-platform",
        prNumber: 42,
        branch: "mason/test",
        expectedHeadSha: "sha-1",
        requiredChecks: ["npm run lint"],
      },
      checks(),
    );
    expect(result.status).toBe("passed");
    expect(result.requiredChecksPassed).toBe(true);
  });

  it("rejects wrong repository", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "Other/repo", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks());
    expect(result.status).toBe("wrong_repository");
  });

  it("rejects wrong pr", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 99, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks());
    expect(result.status).toBe("wrong_pr");
  });

  it("rejects wrong branch", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "other", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks());
    expect(result.status).toBe("wrong_branch");
  });

  it("rejects stale head", () => {
    const sample = { ...baseSample(), headSha: "sha-1" };
    const result = classifyCiEvidenceBinding(sample, { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks({ headSha: "sha-2" }));
    expect(result.status).toBe("stale_head");
  });

  it("rejects superseded run", () => {
    const sample = { ...baseSample(), headSha: "sha-3" };
    const result = classifyCiEvidenceBinding(sample, { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-2", requiredChecks: ["npm run lint"] }, checks({ headSha: "sha-3" }));
    expect(result.status).toBe("superseded");
  });

  it("rejects missing required check", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run test"] }, checks());
    expect(result.status).toBe("failed");
    expect(result.detail).toBe("required_checks_missing");
  });

  it("rejects pending required check", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks({ status: "in_progress", conclusion: null }));
    expect(result.status).toBe("pending");
    expect(result.requiredChecksPassed).toBe(false);
  });

  it("rejects failed required check", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks({ conclusion: "failure" }));
    expect(result.status).toBe("failed");
    expect(result.detail).toBe("required_check_failed");
  });

  it("rejects unrecognized check set", () => {
    const result = classifyCiEvidenceBinding(baseSample(), { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: [] }, checks());
    expect(result.status).toBe("unrecognized_required_checks");
  });

  it("validation requested is not passed validation", () => {
    const sample = { ...baseSample(), status: "pending" as const, terminalValidationState: "requested" as const };
    const result = classifyCiEvidenceBinding(sample, { repository: "AIOS-HQ/aios-platform", prNumber: 42, branch: "mason/test", expectedHeadSha: "sha-1", requiredChecks: ["npm run lint"] }, checks({ status: "queued", conclusion: null }));
    expect(result.status).not.toBe("passed");
    expect(result.requiredChecksPassed).toBe(false);
  });

  it("fails closed on empty evidence payload", () => {
    const sample = { ...baseSample(), repository: null, prNumber: null, branch: null };
    const result = classifyCiEvidenceBinding(
      sample,
      {
        repository: "AIOS-HQ/aios-platform",
        prNumber: 42,
        branch: "mason/test",
        expectedHeadSha: "sha-1",
        requiredChecks: ["npm run lint"],
      },
      [],
    );
    expect(result.status).toBe("wrong_repository");
  });

  it("fails closed on ambiguous workflow source", () => {
    const result = classifyCiEvidenceBinding(
      baseSample(),
      {
        repository: "AIOS-HQ/aios-platform",
        prNumber: 42,
        branch: "mason/test",
        expectedHeadSha: "sha-1",
        requiredChecks: ["npm run lint"],
      },
      checks({ source: "unknown", workflowId: null, checkId: null }),
    );
    expect(result.status).toBe("ambiguous_workflow_source");
  });

  it("fails closed on foreign repository evidence", () => {
    const result = classifyCiEvidenceBinding(
      baseSample(),
      {
        repository: "AIOS-HQ/aios-platform",
        prNumber: 42,
        branch: "mason/test",
        expectedHeadSha: "sha-1",
        requiredChecks: ["npm run lint"],
      },
      checks({ repository: "fork/aios-platform" }),
    );
    expect(result.status).toBe("foreign_repository");
  });

  it("classifies one trusted non-terminal required check as pending", () => {
    const requiredAliases = getGithubCheckAliasesForRequirements(defaultMasonValidationRequirements());
    const pendingAlias = requiredAliases[0];
    expect(pendingAlias).toBeDefined();
    const observedChecks = requiredAliases.map((name, index) => ({
      name,
      status: name === pendingAlias ? "in_progress" : "completed",
      conclusion: name === pendingAlias ? null : "success",
      headSha: "sha-1",
      branch: "mason/test",
      repository: "AIOS-HQ/aios-platform",
      prNumber: 42,
      workflowId: `wf-${index}`,
      checkId: `check-${index}`,
      source: "workflow_run" as const,
      observedAt: "2026-07-24T00:00:00.000Z",
    })) satisfies CiObservedCheck[];

    const result = classifyCiEvidenceBinding(
      baseSample(),
      {
        repository: "AIOS-HQ/aios-platform",
        prNumber: 42,
        branch: "mason/test",
        expectedHeadSha: "sha-1",
        requiredChecks: requiredAliases,
      },
      observedChecks,
    );

    expect(result.status).toBe("pending");
    expect(result.detail).toBe("required_checks_pending");
    expect(result.requiredChecksPassed).toBe(false);
    expect(result.checkClassifications?.some((entry) => entry.status === "pending")).toBe(true);
    expect(result.checkClassifications?.some((entry) => entry.status === "missing")).toBe(false);
    expect(result.checkClassifications?.some((entry) => entry.status === "failed")).toBe(false);
    expect(result.checkClassifications?.some((entry) => entry.status === "unrecognized")).toBe(false);
  });
});
