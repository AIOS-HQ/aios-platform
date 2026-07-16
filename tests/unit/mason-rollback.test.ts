import { describe, expect, it, vi } from "vitest";

import {
  classifyRollbackTrigger,
  createMasonRollbackPlan,
  executeMasonRollbackPlan,
  resolveRollbackOutcome,
} from "@/lib/harmony/code/mason-rollback";
import type { MasonRuntimeExecutionResult, MasonRuntimeExecutorAdapters } from "@/lib/harmony/code/mason-runtime-executor";
import { canTransitionMasonRuntimeState } from "@/lib/harmony/code/mason-runtime-state";

function adapters(overrides?: Partial<MasonRuntimeExecutorAdapters>): MasonRuntimeExecutorAdapters {
  return {
    github: {
      createBranch: vi.fn(async () => ({ branch: "mason/rollback" })),
      commitFile: vi.fn(async () => ({ sha: "abc" })),
      openPullRequest: vi.fn(async () => ({ number: 42, url: "https://example/pr/42" })),
      createIssue: vi.fn(async () => ({ number: 7 })),
      closePullRequest: vi.fn(async () => ({ closed: true })),
    },
    vercel: {
      inspectPreview: vi.fn(async () => ({ previewUrl: "https://preview.example" })),
    },
    harmony: {
      requestValidation: vi.fn(async () => ({ requested: true })),
      reportOutcome: vi.fn(async () => ({ reported: true })),
      recordActivity: vi.fn(async () => ({ recorded: true })),
      updateReviewQueue: vi.fn(async () => ({ queued: true })),
      updateJuliusMemory: vi.fn(async () => ({ remembered: true })),
      updateCompanySkills: vi.fn(async () => ({ learned: true })),
    },
    ...overrides,
  };
}

function runtimeResult(overrides?: Partial<MasonRuntimeExecutionResult>): MasonRuntimeExecutionResult {
  return {
    status: "failed",
    summary: "failed",
    pullRequestUrl: "https://example/pr/42",
    previewUrl: "https://preview.example",
    results: [
      {
        operation: {
          kind: "github_create_branch",
          connectorId: "github",
          capabilityId: "create_branch",
          approved: true,
          summary: "create branch",
          params: { repo: "AIOS-HQ/aios-platform", branch: "mason/rollback", base: "main" },
        },
        status: "completed",
        summary: "ok",
        output: { branch: "mason/rollback" },
      },
      {
        operation: {
          kind: "github_open_pull_request",
          connectorId: "github",
          capabilityId: "open_pull_request",
          approved: true,
          summary: "open pr",
          params: { repo: "AIOS-HQ/aios-platform", title: "x", head: "mason/rollback", base: "main", body: "x" },
        },
        status: "completed",
        summary: "ok",
        output: { pr_number: 42, url: "https://example/pr/42" },
      },
      {
        operation: {
          kind: "validation_request",
          connectorId: "harmony",
          capabilityId: "request_validation_commands",
          approved: true,
          summary: "validate",
          params: { repo: "AIOS-HQ/aios-platform", branch: "mason/rollback", commands: ["npm test"] },
        },
        status: "failed",
        summary: "validation failed",
      },
      {
        operation: {
          kind: "vercel_check_preview",
          connectorId: "vercel",
          capabilityId: "deployment_status",
          approved: false,
          summary: "preview",
          params: { repo: "AIOS-HQ/aios-platform", branch: "mason/rollback", objective: "test" },
        },
        status: "failed",
        summary: "preview failed",
      },
    ],
    plan: {
      bridge: {
        scopedPlan: {
          branchName: "mason/rollback",
        },
      },
    } as MasonRuntimeExecutionResult["plan"],
    ...overrides,
  };
}

describe("Mason rollback engine", () => {
  it("creates no-op rollback when no mutation occurred", () => {
    const runtime = runtimeResult({
      results: [],
      pullRequestUrl: null,
      previewUrl: null,
      plan: { bridge: { scopedPlan: { branchName: "mason/rollback" } } } as MasonRuntimeExecutionResult["plan"],
    });

    const plan = createMasonRollbackPlan({
      request: {
        executionId: "exec-1",
        repository: "AIOS-HQ/aios-platform",
        branch: null,
        trigger: "unexpected_runtime_failure",
      },
      runtime,
    });

    expect(plan.operations.some((operation) => operation.kind === "noop")).toBe(true);
  });

  it("builds compensation steps for PR, preview, validation, and reporting", () => {
    const plan = createMasonRollbackPlan({
      request: {
        executionId: "exec-2",
        repository: "AIOS-HQ/aios-platform",
        branch: "mason/rollback",
        trigger: "validation_failure",
      },
      runtime: runtimeResult(),
    });

    expect(plan.operations.map((operation) => operation.kind)).toEqual(
      expect.arrayContaining([
        "close_pull_request",
        "mark_branch_for_cleanup",
        "record_preview_failure",
        "record_validation_failure",
        "emit_compensating_report",
      ]),
    );
  });

  it("executes rollback with idempotent skip on repeated request", async () => {
    const runtime = runtimeResult();
    const plan = createMasonRollbackPlan({
      request: {
        executionId: "exec-3",
        repository: "AIOS-HQ/aios-platform",
        branch: "mason/rollback",
        trigger: "validation_failure",
      },
      runtime,
    });

    const completed = new Set<string>();
    const first = await executeMasonRollbackPlan(plan, {
      runtime,
      adapters: adapters(),
      operationScopeId: "scope-1",
      alreadyCompensated: completed,
    });
    const second = await executeMasonRollbackPlan(plan, {
      runtime,
      adapters: adapters(),
      operationScopeId: "scope-1",
      alreadyCompensated: completed,
    });

    expect(first.outcome).toBe("recovered");
    expect(second.steps.some((step) => step.status === "skipped")).toBe(true);
  });

  it("returns partial recovery when one compensation step fails", async () => {
    const runtime = runtimeResult();
    const failingAdapters = adapters({
      harmony: {
        ...adapters().harmony,
        reportOutcome: vi.fn(async (payload) => {
          if (String(payload.kind).includes("validation_failure")) {
            throw new Error("report failed");
          }
          return { reported: true };
        }),
      },
    });

    const plan = createMasonRollbackPlan({
      request: {
        executionId: "exec-4",
        repository: "AIOS-HQ/aios-platform",
        branch: "mason/rollback",
        trigger: "validation_failure",
      },
      runtime,
    });

    const result = await executeMasonRollbackPlan(plan, {
      runtime,
      adapters: failingAdapters,
      operationScopeId: "scope-2",
    });

    expect(result.outcome).toBe("partially_recovered");
    expect(result.toState).toBe("recovery_failed");
  });

  it("classifies founder cancellation and resolves cancelled_safely outcome", () => {
    const trigger = classifyRollbackTrigger(runtimeResult(), true);
    expect(trigger).toBe("founder_requested_cancellation");
    expect(resolveRollbackOutcome({ trigger, steps: [] })).toBe("cancelled_safely");
  });

  it("enforces legal runtime transitions for rollback states", () => {
    expect(canTransitionMasonRuntimeState("executing", "rollback_pending")).toBe(true);
    expect(canTransitionMasonRuntimeState("rollback_pending", "rolling_back")).toBe(true);
    expect(canTransitionMasonRuntimeState("rolling_back", "recovered")).toBe(true);
    expect(canTransitionMasonRuntimeState("completed", "rollback_pending")).toBe(false);
  });

  it("propagates adapter errors as failed rollback steps", async () => {
    const runtime = runtimeResult();
    const failingAdapters = adapters({
      github: {
        ...adapters().github,
        closePullRequest: vi.fn(async () => {
          throw new Error("close failed");
        }),
      },
    });

    const plan = createMasonRollbackPlan({
      request: {
        executionId: "exec-5",
        repository: "AIOS-HQ/aios-platform",
        branch: "mason/rollback",
        trigger: "pull_request_creation_failure",
      },
      runtime,
    });

    const result = await executeMasonRollbackPlan(plan, {
      runtime,
      adapters: failingAdapters,
      operationScopeId: "scope-3",
    });

    expect(result.steps.some((step) => step.status === "failed")).toBe(true);
    expect(result.outcome).toBe("partially_recovered");
  });
});
