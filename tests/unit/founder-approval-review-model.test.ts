import { describe, it, expect } from "vitest";
import { buildFounderReviewModel } from "@/lib/harmony/autonomy/founder-review";

describe("founder review model", () => {
  it("builds meaningful engineering context for commit_file", () => {
    const model = buildFounderReviewModel({
      sourceStore: "spine",
      status: "pending",
      id: "approval_1",
      companyId: "company-1",
      title: "mason · commit_file",
      type: "commit_file",
      risk: "medium",
      originalAgent: "mason",
      originalAction: "commit_file",
      originalParams: {
        objective: "Patch approval query",
        repository: "AIOS-HQ/aios-platform",
        branch: "hotfix/approval",
        files: ["src/lib/data/os/approvals.ts"],
        validationPlan: "Run lint, typecheck, tests",
        rollbackPlan: "Revert hotfix commit",
      },
      requiredContext: { execution_id: "exec-1", correlation_id: "corr-1" },
    });

    expect(model.repository).toBe("AIOS-HQ/aios-platform");
    expect(model.branch).toBe("hotfix/approval");
    expect(model.filesAffected).toContain("src/lib/data/os/approvals.ts");
    expect(model.validationEvidence).toContain("lint");
    expect(model.rollbackPlan).toContain("Revert");
  });

  it("builds meaningful context for open_pull_request", () => {
    const model = buildFounderReviewModel({
      sourceStore: "spine",
      status: "pending",
      id: "approval_2",
      companyId: "company-1",
      title: "mason · open_pull_request",
      type: "open_pull_request",
      risk: "medium",
      originalAgent: "mason",
      originalAction: "open_pull_request",
      originalParams: {
        repository: "AIOS-HQ/aios-platform",
        branch: "feature/x",
        pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/123",
      },
    });

    expect(model.pullRequest).toContain("/pull/123");
    expect(model.reasonRequired.toLowerCase()).toContain("repository mutation");
  });

  it("builds deployment context for deploy_production", () => {
    const model = buildFounderReviewModel({
      sourceStore: "spine",
      status: "pending",
      id: "approval_3",
      companyId: "company-1",
      title: "mason · deploy_production",
      type: "deploy_production",
      risk: "high",
      originalAgent: "mason",
      originalAction: "deploy_production",
      originalParams: {
        environment: "production",
        expectedImpact: "Release approvals fix",
        validation: "health endpoint + smoke test",
        rollback_plan: "promote previous deployment",
      },
    });

    expect(model.deploymentTarget).toBe("production");
    expect(model.reasonRequired.toLowerCase()).toContain("deployment");
    expect(model.expectedImpact).toContain("approvals");
  });

  it("uses truthful fallback for legacy approvals", () => {
    const model = buildFounderReviewModel({
      sourceStore: "legacy",
      status: "pending",
      id: "legacy-1",
      companyId: "company-1",
      title: "Legacy approval",
      type: "task",
      risk: "medium",
    });

    expect(model.contextAvailability).toBe("legacy_unavailable");
    expect(model.objective).toBeUndefined();
    expect(model.proposedWork.length).toBeGreaterThan(0);
  });

  it("does not expose secret-like values as explicit model fields", () => {
    const model = buildFounderReviewModel({
      sourceStore: "spine",
      status: "pending",
      id: "approval_4",
      companyId: "company-1",
      title: "connector",
      type: "send_external_message",
      risk: "medium",
      originalAction: "send_external_message",
      originalParams: {
        access_token: "secret",
        cookie: "abc",
        authorization: "Bearer token",
      },
    });

    expect(model.repository).toBeUndefined();
    expect(model.pullRequest).toBeUndefined();
    expect(model.proposedWork.join(" ")).toContain("Action requested");
  });
});
