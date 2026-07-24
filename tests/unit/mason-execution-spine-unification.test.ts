import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createMasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";
import { createMasonExecutionIdentity } from "@/lib/harmony/code/mason-execution-identity";
import { classifyMasonProtectedPaths } from "@/lib/harmony/code/mason-protected-paths";
import { createMasonLiveExecutionPlan } from "@/lib/harmony/code/mason-live-execution";
import {
  runMasonClosedLoopExecution,
  type MasonClosedLoopAdapters,
  type MasonClosedLoopInput,
} from "@/lib/workforce/mason-closed-loop";

function identity() {
  return createMasonExecutionIdentity({
    userId: "founder-1",
    companyId: "company-1",
    actorId: "founder-1",
    source: "founder_session",
    repository: "AIOS-HQ/aios-platform",
    objective: "Update protected runtime policy",
    branch: "mason/protected",
    correlationId: "correlation-7d",
  });
}

describe("Mason 7D execution spine", () => {
  it("creates one canonical execution identity from the incoming correlation", () => {
    const first = identity();
    const second = identity();
    expect(first).toEqual(second);
    expect(first.executionId).toContain("correlation-7d");
    expect(first.correlationId).toBe("correlation-7d");
    expect(first.companyId).toBe("company-1");
  });

  it("classifies every protected governance surface deterministically", () => {
    const resources = classifyMasonProtectedPaths([
      "src/lib/auth/roles.ts",
      "src/lib/harmony/autonomy/policy-engine.ts",
      "src/lib/billing/enforce.ts",
      "src/lib/payments/processor.ts",
      "supabase/migrations/20260724000000_example.sql",
      ".github/workflows/launch.yml",
      "infra/azure/container-app.yml",
      "src/lib/runtime-policy.ts",
      ".env.example",
    ]);
    expect(new Set(resources.map((resource) => resource.kind))).toEqual(new Set([
      "authentication",
      "approvals",
      "billing",
      "payments",
      "migrations",
      "github_workflows",
      "infrastructure",
      "runtime_policies",
      "environment_handling",
    ]));
    expect(resources.every((resource) => resource.approvalLevel === "founder")).toBe(true);
  });

  it("builds a typed contract without deriving mutation instructions from prose", () => {
    const task = createMasonEngineeringTaskContract({
      objective: "Create a branch, edit auth, and merge it now",
      repository: "AIOS-HQ/aios-platform",
      executionIdentity: identity(),
    });
    expect(task.requestedOutcome).toBe("plan_only");
    expect(task.runtimeRequest.fileChanges).toEqual([]);
    expect(task.runtimeRequest.openPullRequest).toBe(false);
    expect(task.expectedDeliverables).toEqual(["Grounded engineering plan; no repository mutation."]);
  });

  it("elevates typed protected-path work through Founder approval requirements", () => {
    const task = createMasonEngineeringTaskContract({
      objective: "Update the authenticated approval route",
      repository: "AIOS-HQ/aios-platform",
      executionIdentity: identity(),
      requestedOutcome: "open_pull_request",
      branchName: "mason/protected",
      fileChanges: [{ path: "src/lib/auth/roles.ts", content: "export const unchanged = true;\n" }],
    });
    expect(task.riskClassification).toBe("high");
    expect(task.approvalRequirements).toMatchObject({ required: true, level: "founder" });
    expect(task.protectedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "authentication", path: "src/lib/auth/roles.ts" }),
    ]));
  });

  it("keeps Review Queue and verified learning writes out of runtime reporting", () => {
    const plan = createMasonLiveExecutionPlan({
      objective: "Create a governed branch",
      repository: "AIOS-HQ/aios-platform",
      founderApproved: true,
      requesterRole: "founder",
      requestedOutcome: "create_branch",
      branchName: "mason/governed",
      openPullRequest: false,
      executionIdentity: identity(),
    });
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "github_create_branch",
      "harmony_report_outcome",
      "activity_record",
    ]);
    expect(plan.operations.map((operation) => operation.kind)).not.toEqual(expect.arrayContaining([
      "review_queue_update",
      "julius_memory_update",
      "company_skill_update",
    ]));
    expect(plan.operations.find((operation) => operation.kind === "activity_record")?.params).toMatchObject({
      executionId: identity().executionId,
      correlationId: identity().correlationId,
    });
  });

  it("uses production execution evidence without invoking synthetic commit or validation adapters", async () => {
    const input: MasonClosedLoopInput = {
      executionId: "execution-7d",
      correlationId: "correlation-7d",
      companyId: "company-1",
      actorId: "founder-1",
      objective: "Create branch",
      repository: "AIOS-HQ/aios-platform",
      branch: "mason/real-runtime",
    };
    const forbidden = vi.fn(async () => { throw new Error("synthetic_adapter_called"); });
    const adapters: MasonClosedLoopAdapters = {
      retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
      createPlan: vi.fn(async () => ({ summary: "grounded" })),
      runExecution: vi.fn(async () => ({
        status: "completed",
        summary: "real runtime branch created",
        pullRequestUrl: null,
        previewUrl: null,
        executionId: input.executionId,
        branch: "mason/real-runtime",
        commitSha: null,
        pullRequestNumber: null,
        validationMode: "external_ci",
      })),
      runValidation: forbidden,
      planCorrection: forbidden,
      runCorrection: forbidden,
      createCommit: forbidden,
      pushBranch: forbidden,
      createPullRequest: forbidden,
      readCiStatus: forbidden,
      decideRemediation: forbidden,
      runRemediation: forbidden,
      evaluateMergeGate: forbidden,
      performMerge: forbidden,
      writeJulius: vi.fn(async () => undefined),
      appendLedger: vi.fn(async () => undefined),
      buildFinalReport: vi.fn(async ({ terminalState, states }) => ({
        terminalState,
        merged: false,
        ciPassed: false,
        unresolvedGate: false,
        validationAttempts: 0,
        ciAttempts: 0,
        states: states.map((state) => state.state),
      })),
      loadSnapshot: vi.fn(async () => null),
      saveSnapshot: vi.fn(async () => undefined),
    };

    const result = await runMasonClosedLoopExecution(input, adapters, {
      maxValidationCorrectionAttempts: 0,
      maxCiRemediationAttempts: 0,
    });
    expect(result.terminalState).toBe("completed");
    expect(result.states.map((state) => state.state)).toEqual(expect.arrayContaining([
      "execution_started",
      "validation_requested",
      "branch_pushed",
      "completed",
    ]));
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("keeps server-side role verification and merge denial in the active entrypoint", () => {
    const chatAction = readFileSync("src/lib/workforce/chat-actions.ts", "utf8");
    const masonAction = readFileSync("src/lib/workforce/mason-action.ts", "utf8");
    expect(chatAction).toContain("currentUserIsAdmin");
    expect(chatAction).toContain("masonFounderApproved(formData.get(\"founder_approved\"))");
    expect(chatAction).not.toContain("founder_approved\") ?? message");
    expect(masonAction).toContain("founder_merge_authorization_required");
    expect(masonAction).toContain("mason_has_no_merge_authority");
    expect(masonAction).not.toContain("pending-${executionId}");
    expect(masonAction).not.toContain("runRemediation: async () => ({ ok: true })");
  });
});
