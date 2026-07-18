import { describe, expect, it, vi } from "vitest";
import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration";
import { evaluateAutonomyPolicy } from "@/lib/harmony/autonomy/policy-engine";

vi.mock("@/lib/harmony/autonomy/data-access", () => ({
  getActiveDirectives: vi.fn(async () => []),
  createApprovalPayload: vi.fn(async () => ({ approval_id: "appr-1" })),
}));

vi.mock("@/lib/harmony/autonomy/policy-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/harmony/autonomy/policy-engine")>(
    "@/lib/harmony/autonomy/policy-engine",
  );
  return {
    ...actual,
    evaluateAutonomyPolicy: vi.fn(actual.evaluateAutonomyPolicy),
  };
});

describe("Mason intent classification", () => {
  async function actionFor(objective: string) {
    await determineMasonExecutionReadiness(
      "founder-1",
      "company-1",
      objective,
      "AIOS-HQ/aios-platform",
      2,
      false,
    );

    const mock = vi.mocked(evaluateAutonomyPolicy);
    const lastCall = mock.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
    return lastCall?.[0].action;
  }

  it("treats production verification with do-not-execute as read-only/non-deploy", async () => {
    await expect(actionFor("Production verification test. Do not execute tools.")).resolves.not.toBe(
      "deploy_production",
    );
  });

  it("treats explain production runtime health do-not-execute as read-only/non-deploy", async () => {
    await expect(
      actionFor("Explain production runtime health. Do not execute anything."),
    ).resolves.not.toBe("deploy_production");
  });

  it("treats respond-only acknowledgement as read-only/non-deploy", async () => {
    await expect(actionFor("Respond only with Mason runtime operational.")).resolves.not.toBe(
      "deploy_production",
    );
  });

  it("treats read-only connector diagnostics as non-deploy", async () => {
    await expect(actionFor("Check GitHub and Vercel status read-only.")).resolves.not.toBe(
      "deploy_production",
    );
  });

  it("does not map negated production deploy intent to deploy_production", async () => {
    await expect(actionFor("Do not deploy to production.")).resolves.not.toBe("deploy_production");
  });

  it("maps explicit deploy intent to deploy_production", async () => {
    await expect(actionFor("Deploy to production.")).resolves.toBe("deploy_production");
  });

  it("keeps branch and PR requests mutation-oriented", async () => {
    await expect(actionFor("Create a branch and open a PR.")).resolves.toBe("create_branch");
  });
});
