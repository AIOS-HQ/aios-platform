import { describe, it, expect, vi } from "vitest";
import { resumeApprovedExecution, type ResumeDeps } from "@/lib/harmony/autonomy/execution-resumption";
import type { ApprovalPayload, ExecutionResult } from "@/lib/harmony/autonomy/types";

const NOW = new Date("2026-01-01T00:00:00Z");

function connectorApproval(
  overrides: Partial<ApprovalPayload> = {},
  paramsOverrides: Record<string, unknown> = {},
): ApprovalPayload {
  const baseParams: Record<string, unknown> = {
    connectorId: "github",
    capabilityId: "list_pull_requests",
    provider: "github",
    connectionId: "conn-1",
    params: { repo: "AIOS-HQ/aios-platform" },
    taskContract: {
      executionIdentity: {
        executionId: "exec-conn-1",
        requestId: "req-conn-1",
        correlationId: "corr-conn-1",
      },
    },
  };

  const mergedParams: Record<string, unknown> = { ...baseParams, ...paramsOverrides };

  if (Object.prototype.hasOwnProperty.call(paramsOverrides, "capabilityId") && !paramsOverrides.capabilityId) {
    delete mergedParams.capabilityId;
  }

  return {
    approval_id: "approval-connector-1",
    original_actor: "agent",
    original_agent: "harmony",
    original_domain: "operations",
    original_action: "open_pull_request",
    original_params: mergedParams,
    required_context: {},
    created_at: "2026-01-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function deps(overrides: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    getApprovalPayload: async () => null,
    getApprovedApprovalPayload: async () => connectorApproval(),
    recordExecutionResult: async (_u, _c, result) => result,
    findExecutionResultByExecutionId: async () => null,
    findExecutionResultByRequestId: async () => null,
    findExecutionResultByCorrelationId: async () => null,
    runConnector: async () => ({ ok: true, status: "completed", message: "ok", data: { connector: "github" } }),
    runMason: async () => ({ status: "completed", summary: "ok", pullRequestUrl: null, previewUrl: null }),
    runWorkItem: async () => "completed",
    now: () => NOW,
    ...overrides,
  };
}

describe("connector resumption runtime r2 m2", () => {
  it("resumes a valid connector approval successfully", async () => {
    const runConnector = vi.fn(async () => ({ ok: true, status: "completed", message: "ok", data: { items: [] } }));
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({ runConnector, recordExecutionResult }),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.execution_result?.status).toBe("completed");
    expect(runConnector).toHaveBeenCalledTimes(1);
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
  });

  it("blocks unsupported connector/provider before dispatch", async () => {
    const runConnector = vi.fn();

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () =>
          connectorApproval(
            {},
            {
              connectorId: "unknown-provider",
              provider: "unknown-provider",
              connectionId: "conn-unsupported-1",
            },
          ),
        runConnector,
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("unsupported_connector_provider");
    expect(outcome.execution_result?.status).toBe("blocked");
    expect(runConnector).not.toHaveBeenCalled();
  });

  it("blocks missing capability identifier before dispatch", async () => {
    const runConnector = vi.fn();

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () => connectorApproval({}, { capabilityId: "" }),
        runConnector,
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("missing_connector_capability");
    expect(outcome.execution_result?.status).toBe("blocked");
    expect(runConnector).not.toHaveBeenCalled();
  });

  it("blocks stale connector context before dispatch", async () => {
    const runConnector = vi.fn();

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({
        getApprovedApprovalPayload: async () => connectorApproval({ expires_at: "2025-01-01T00:00:00Z" }),
        runConnector,
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("expired");
    expect(outcome.execution_result?.status).toBe("blocked");
    expect(runConnector).not.toHaveBeenCalled();
  });

  it("blocks disconnected or unready connector safely", async () => {
    const runConnector = vi.fn(async () => ({ ok: false, status: "blocked", message: "not_connected" }));
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({ runConnector, recordExecutionResult }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.execution_result?.status).toBe("blocked");
    expect(outcome.error).toBe("not_connected");
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
  });

  it("persists failed result when connector execution fails", async () => {
    const runConnector = vi.fn(async () => ({ ok: false, status: "failed", message: "execution_failed" }));
    const recordExecutionResult = vi.fn(async (_u: string, _c: string | null, result: ExecutionResult) => result);

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({ runConnector, recordExecutionResult }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.execution_result?.status).toBe("failed");
    expect(outcome.error).toBe("execution_failed");
    expect(recordExecutionResult).toHaveBeenCalledTimes(1);
  });

  it("is idempotent on duplicate connector resume", async () => {
    const prior: ExecutionResult = {
      execution_id: "exec-conn-1",
      request_id: "req-conn-1",
      correlation_id: "corr-conn-1",
      agent: "harmony",
      domain: "operations",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval-connector-1",
      founder_approved_at: NOW.toISOString(),
      completed_at: NOW.toISOString(),
      created_at: NOW.toISOString(),
      expires_at: new Date(NOW.getTime() + 86400000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
      result_data: { items: [] },
    };

    const runConnector = vi.fn();

    const outcome = await resumeApprovedExecution(
      "user-1",
      "approval-connector-1",
      "company-1",
      deps({
        findExecutionResultByExecutionId: async () => prior,
        runConnector,
      }),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.execution_result).toEqual(prior);
    expect(runConnector).not.toHaveBeenCalled();
  });
});
