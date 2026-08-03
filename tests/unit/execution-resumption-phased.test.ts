import { describe, it, expect, vi } from "vitest";
import { resumeApprovedExecution, type ResumeDeps } from "@/lib/harmony/autonomy/execution-resumption";
import type { ApprovalPayload, ExecutionResult } from "@/lib/harmony/autonomy/types";

const NOW = new Date("2026-01-01T00:00:00Z");

function approval(overrides: Partial<ApprovalPayload> = {}): ApprovalPayload {
  return {
    approval_id: "approval-1",
    original_actor: "founder",
    original_agent: "mason",
    original_domain: "engineering",
    original_action: "open_pull_request",
    original_params: {
      objective: "Ship Runtime R2",
      repository: "AIOS-HQ/aios-platform",
      executionIdentity: {
        executionId: "exec-1",
        requestId: "req-1",
        correlationId: "corr-1",
      },
    },
    required_context: {},
    created_at: "2026-01-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function deps(overrides: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    getApprovalPayload: async () => null,
    getApprovedApprovalPayload: async () => approval(),
    recordExecutionResult: async (_u, _c, result) => result,
    findExecutionResultByExecutionId: async () => null,
    findExecutionResultByRequestId: async () => null,
    findExecutionResultByCorrelationId: async () => null,
    runConnector: async () => ({ ok: true, status: "completed", message: "ok" }),
    runMason: async () => ({ status: "completed", summary: "ok", pullRequestUrl: null, previewUrl: null }),
    runWorkItem: async () => "completed",
    now: () => NOW,
    ...overrides,
  };
}

describe("execution resumption phased service", () => {
  it("resumes a valid mason approval", async () => {
    const runMason = vi.fn(async () => ({ status: "completed", summary: "done", pullRequestUrl: null, previewUrl: null }));
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const outcome = await resumeApprovedExecution("user-1", "approval-1", "company-1", deps({ runMason, recordExecutionResult }));

    expect(outcome.ok).toBe(true);
    expect(outcome.execution_result?.status).toBe("completed");
    expect(runMason).toHaveBeenCalledTimes(1);
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
  });

  it("blocks stale context deterministically", async () => {
    const runMason = vi.fn();
    const result = await resumeApprovedExecution(
      "user-1",
      "approval-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () =>
          approval({
            expires_at: "2025-01-01T00:00:00Z",
          }),
        runMason,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.execution_result?.status).toBe("blocked");
    expect(result.error).toBe("expired");
    expect(runMason).not.toHaveBeenCalled();
  });

  it("blocks invalid context before dispatch", async () => {
    const runMason = vi.fn();
    const result = await resumeApprovedExecution(
      "user-1",
      "approval-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () =>
          approval({
            original_action: "merge_pull_request",
            original_params: {
              objective: "merge",
              repository: "AIOS-HQ/aios-platform",
              executionIdentity: {
                executionId: "exec-1",
                requestId: "req-1",
                correlationId: "corr-1",
              },
            },
          }),
        runMason,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_merge_resume_context");
    expect(result.execution_result?.status).toBe("blocked");
    expect(runMason).not.toHaveBeenCalled();
  });

  it("persists failed result when mason dispatch fails", async () => {
    const runMason = vi.fn(async () => ({ status: "failed", summary: "mason_down", pullRequestUrl: null, previewUrl: null }));
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const result = await resumeApprovedExecution("user-1", "approval-1", "company-1", deps({ runMason, recordExecutionResult }));

    expect(result.ok).toBe(false);
    expect(result.execution_result?.status).toBe("failed");
    expect(result.error).toBe("mason_down");
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
  });

  it("returns deterministic blocked result for missing execution identity", async () => {
    const runMason = vi.fn();
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const result = await resumeApprovedExecution(
      "user-1",
      "approval-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () =>
          approval({
            original_params: {
              objective: "Ship Runtime R2",
              repository: "AIOS-HQ/aios-platform",
            },
          }),
        recordExecutionResult,
        runMason,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_execution_identity");
    expect(result.execution_result?.status).toBe("blocked");
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
    expect(runMason).not.toHaveBeenCalled();
  });
});
