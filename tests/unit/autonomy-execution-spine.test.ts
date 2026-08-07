import { describe, expect, it, vi } from "vitest";
import {
  resumeApprovedExecution,
  recordRejectedExecution,
  type ResumeDeps,
} from "@/lib/harmony/autonomy/execution-resumption";
import { getPendingApprovalQueue } from "@/lib/harmony/autonomy/review-queue";
import {
  buildConnectorApprovalPayload,
  evaluateConnectorRun,
} from "@/lib/harmony/autonomy/connector-policy";
import { evaluateAutonomyPolicy } from "@/lib/harmony/autonomy/policy-engine";
import type { ApprovalPayload, ExecutionResult } from "@/lib/harmony/autonomy/types";
import type { ConnectorCapability } from "@/lib/integrations/connectors";

const T0 = new Date("2026-07-04T00:00:00.000Z");

function payload(overrides: Partial<ApprovalPayload> = {}): ApprovalPayload {
  const created = new Date("2026-07-03T00:00:00.000Z");
  return {
    approval_id: "approval_1",
    original_actor: "agent",
    original_agent: "mason",
    original_domain: "engineering",
    original_action: "merge_pull_request",
    original_params: {
      objective: "Merge the release PR",
      repository: "AIOS-HQ/aios-platform",
      policyDecision: {
        decision: "approval_required",
        requiresApproval: true,
        approvedAt: "2026-07-03T00:00:00.000Z",
        actor: "agent",
        agent: "mason",
        domain: "engineering",
        action: "merge_pull_request",
      },
    },
    required_context: {},
    created_at: created.toISOString(),
    expires_at: new Date(created.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** Capture recorded execution_results and return them from the fake recorder. */
function recorder() {
  const calls: ExecutionResult[] = [];
  const fn: ResumeDeps["recordExecutionResult"] = async (_userId, _companyId, result) => {
    calls.push(result);
    return result;
  };
  return { calls, fn };
}

describe("Autonomy Execution Spine", () => {
  it("scenario 1 — approval payload is created for a connector action needing approval", () => {
    const writeCap: ConnectorCapability = { id: "create_issue", mode: "write", risk: "routine" };
    // A routine write still needs approval below Executive; a real approval-class does too.
    const policy = evaluateConnectorRun({ id: "merge_pull_request", mode: "write", risk: "approval" }, 3);
    expect(policy.requiresApproval).toBe(true);

    const built = buildConnectorApprovalPayload("github", "create_issue", { repo: "AIOS-HQ/aios-platform" }, policy, T0);
    expect(built.approval_id.startsWith("approval_conn_")).toBe(true);
    expect(built.original_actor).toBe("agent");
    expect(built.original_params).toMatchObject({
      connectorId: "github",
      capabilityId: "create_issue",
      params: { repo: "AIOS-HQ/aios-platform" },
    });
    // 72h TTL, expiry strictly after creation.
    expect(new Date(built.expires_at).getTime()).toBeGreaterThan(new Date(built.created_at).getTime());
    expect(writeCap.id).toBe("create_issue");
  });

  it("scenario 2 — Review Queue lists pending approvals with capability label + destructive flag", async () => {
    const connector = buildConnectorApprovalPayload(
      "github",
      "create_issue",
      { repo: "AIOS-HQ/aios-platform" },
      evaluateConnectorRun({ id: "create_issue", mode: "write", risk: "approval" }, 3),
      T0,
    );
    const destructive = payload({
      approval_id: "approval_del",
      original_action: "delete_repository",
      original_params: {
        objective: "Delete the repo",
        repository: "AIOS-HQ/aios-platform",
        policyDecision: {
          decision: "approval_required",
          requiresApproval: true,
          approvedAt: "2026-07-03T00:00:00.000Z",
          actor: "agent",
          agent: "mason",
          domain: "engineering",
          action: "delete_repository",
        },
      },
    });

    const items = await getPendingApprovalQueue("user-1", null, {
      listPendingApprovals: async () => [connector, destructive],
    });

    expect(items).toHaveLength(2);
    const conn = items.find((i) => i.approvalId === connector.approval_id)!;
    expect(conn.label).toBe("github.create_issue");
    expect(conn.destructive).toBe(false);

    const del = items.find((i) => i.approvalId === "approval_del")!;
    expect(del.destructive).toBe(true);
  });

  it("scenario 3 — approve resumes the exact saved Mason execution", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/1",
      previewUrl: null,
    }));
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok" }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            objective: "Open release PR",
            repository: "AIOS-HQ/aios-platform",
            status: "approved",
            executionIdentity: {
              executionId: "exec-s3",
              requestId: "req-s3",
              correlationId: "corr-s3",
            },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            objective: "Open release PR",
            repository: "AIOS-HQ/aios-platform",
            status: "approved",
            executionIdentity: {
              executionId: "exec-s3",
              requestId: "req-s3",
              correlationId: "corr-s3",
            },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      recordExecutionResult: rec.fn,
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      runMason,
      runConnector,
      now: () => T0,
    });

    console.error({ ok: outcome.ok, error: outcome.error, executionResult: outcome.execution_result });
    console.error({ ok: outcome.ok, error: outcome.error, executionResult: outcome.execution_result });
    expect(outcome.ok).toBe(true);
    expect(runMason).toHaveBeenCalledTimes(1);
    expect(runMason).toHaveBeenCalledWith(
      expect.objectContaining({
        founderApproved: true,
        objective: "Open release PR",
        repository: "AIOS-HQ/aios-platform",
      }),
    );
    expect(runConnector).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.request_id).toBe("req-s3");
    expect(rec.calls[0]?.correlation_id).toBe("corr-s3");
    expect(rec.calls[0]).toMatchObject({ status: "completed", required_approval: true, approval_id: "approval_1" });
  });

  it("persists request_id and correlation_id when supplied", async () => {
    const rec = recorder();
    await rec.fn("user-1", "company-1", {
      execution_id: "exec_id_1",
      request_id: "request_id_1",
      correlation_id: "correlation_id_1",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.execution_id).toBe("exec_id_1");
    expect(rec.calls[0]?.request_id).toBe("request_id_1");
    expect(rec.calls[0]?.correlation_id).toBe("correlation_id_1");
  });

  it("persists request_id when supplied without correlation_id", async () => {
    const rec = recorder();
    await rec.fn("user-1", "company-1", {
      execution_id: "exec_id_2",
      request_id: "request_only",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    });

    expect(rec.calls[0]?.execution_id).toBe("exec_id_2");
    expect(rec.calls[0]?.request_id).toBe("request_only");
    expect(rec.calls[0]?.correlation_id).toBeUndefined();
  });

  it("persists correlation_id when supplied without request_id", async () => {
    const rec = recorder();
    await rec.fn("user-1", "company-1", {
      execution_id: "exec_id_3",
      correlation_id: "correlation_only",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    });

    expect(rec.calls[0]?.execution_id).toBe("exec_id_3");
    expect(rec.calls[0]?.request_id).toBeUndefined();
    expect(rec.calls[0]?.correlation_id).toBe("correlation_only");
  });

  it("scenario 3b — approve resumes a connector execution with approved=true", async () => {
    const rec = recorder();
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok", data: { number: 42 } }));

    const outcome = await resumeApprovedExecution("user-1", "approval_conn", null, {
      getApprovalPayload: async () =>
        payload({
          status: "pending",
          approval_id: "approval_conn",
          original_agent: "harmony",
          original_domain: "operations",
          original_action: "publish_externally",
          original_params: {
            connectorId: "github",
            capabilityId: "create_issue",
            provider: "github",
            connectionId: "conn-s3b",
            status: "approved",
            executionIdentity: {
              executionId: "exec-s3b",
              requestId: "req-s3b",
              correlationId: "corr-s3b",
            },
            params: { repo: "AIOS-HQ/aios-platform" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "harmony",
              domain: "operations",
              action: "publish_externally",
              target: {
                connectorId: "github",
                provider: "github",
                capabilityId: "create_issue",
              },
            },
          },
        }),
      getApprovedApprovalPayload: async () =>
        payload({
          approval_id: "approval_conn",
          original_agent: "harmony",
          original_domain: "operations",
          original_action: "publish_externally",
          original_params: {
            connectorId: "github",
            capabilityId: "create_issue",
            provider: "github",
            connectionId: "conn-s3b",
            status: "approved",
            executionIdentity: {
              executionId: "exec-s3b",
              requestId: "req-s3b",
              correlationId: "corr-s3b",
            },
            params: { repo: "AIOS-HQ/aios-platform" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "harmony",
              domain: "operations",
              action: "publish_externally",
              target: {
                connectorId: "github",
                provider: "github",
                capabilityId: "create_issue",
              },
            },
          },
        }),
      recordExecutionResult: rec.fn,
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      runConnector,
      runMason: vi.fn(),
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(runConnector).toHaveBeenCalledWith(
      "user-1",
      "github",
      "create_issue",
      { repo: "AIOS-HQ/aios-platform" },
      { approved: true },
    );
    expect(rec.calls[0]).toMatchObject({ status: "completed" });
  });

  it("scenario 4 — reject records a blocked execution with the Founder's reason", async () => {
    const rec = recorder();
    const result = await recordRejectedExecution("user-1", payload(), "Not now — ship next sprint", "company-1", {
      recordExecutionResult: rec.fn,
      now: () => T0,
    });

    expect(result).not.toBeNull();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]).toMatchObject({
      status: "blocked",
      required_approval: true,
      approval_id: "approval_1",
      error: { code: "rejected", message: "Not now — ship next sprint", recoverable: false },
    });
    // A rejected action was never founder-approved.
    expect(rec.calls[0].founder_approved_at).toBeUndefined();
  });

  it("scenario 5 — an expired approval cannot resume", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({ status: "completed", summary: "", pullRequestUrl: null, previewUrl: null }));
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok" }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", null, {
      // expires_at is well before T0.
      getApprovalPayload: async () => payload({ expires_at: "2026-07-01T00:00:00.000Z" }),
      getApprovedApprovalPayload: async () => payload({ expires_at: "2026-07-01T00:00:00.000Z" }),
      recordExecutionResult: rec.fn,
      runMason,
      runConnector,
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("expired");
    expect(runMason).not.toHaveBeenCalled();
    expect(runConnector).not.toHaveBeenCalled();
    expect(rec.calls[0]).toMatchObject({ status: "blocked", error: { code: "expired" } });
  });

  it("scenario 6 — destructive actions always require approval, even at Executive autonomy", () => {
    const engine = evaluateAutonomyPolicy({
      actor: "agent",
      agent: "mason",
      domain: "engineering",
      action: "delete_repository",
      current_autonomy_level: 4,
    });
    expect(engine.decision).toBe("approval_required");

    const connector = evaluateConnectorRun({ id: "delete_repository", mode: "write", risk: "destructive" }, 4);
    expect(connector.decision).toBe("approval_required");
    expect(connector.destructive).toBe(true);
  });

  it("scenario 7 — merge approvals are blocked when PR identity is missing", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/1",
      previewUrl: null,
    }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovalPayload: async () =>
        payload({
          original_action: "merge_pull_request",
          original_params: {
            repo: "AIOS-HQ/aios-platform",
            context: { executionId: "exec-1" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "merge_pull_request",
            },
          },
        }),
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "merge_pull_request",
          original_params: {
            repo: "AIOS-HQ/aios-platform",
            context: { executionId: "exec-1" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "merge_pull_request",
            },
          },
        }),
      recordExecutionResult: rec.fn,
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("invalid_merge_resume_context");
    expect(runMason).not.toHaveBeenCalled();
    expect(rec.calls[0]).toMatchObject({
      status: "blocked",
      error: { code: "invalid_merge_resume_context" },
    });
  });

  it("scenario 8 — merge approvals are blocked when execution context is tampered", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/432",
      previewUrl: null,
    }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovalPayload: async () =>
        payload({
          original_action: "merge_pull_request",
          original_params: {
            repo: "AIOS-HQ/aios-platform",
            prNumber: 432,
            prUrl: "https://github.com/AIOS-HQ/aios-platform/pull/432",
            executionId: "exec-real",
            headSha: "abc123",
            mergeReady: true,
            requiredChecksPassed: true,
            context: { executionId: "exec-other" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "merge_pull_request",
            },
          },
        }),
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "merge_pull_request",
          original_params: {
            repo: "AIOS-HQ/aios-platform",
            prNumber: 432,
            prUrl: "https://github.com/AIOS-HQ/aios-platform/pull/432",
            executionId: "exec-real",
            headSha: "abc123",
            mergeReady: true,
            requiredChecksPassed: true,
            context: { executionId: "exec-other" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "merge_pull_request",
            },
          },
        }),
      recordExecutionResult: rec.fn,
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("invalid_merge_resume_context");
    expect(runMason).not.toHaveBeenCalled();
    expect(rec.calls[0]).toMatchObject({
      status: "blocked",
      error: { code: "invalid_merge_resume_context" },
    });
  });

  it("returns prior result when duplicate executionId exists", async () => {
    const rec = recorder();
    const runMason = vi.fn();
    const prior: ExecutionResult = {
      execution_id: "exec-dup",
      request_id: "req-dup",
      correlation_id: "corr-dup",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
      result_data: { summary: "persisted" },
    };

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-dup",
            requestId: "req-x",
            correlationId: "corr-x",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-dup",
            requestId: "req-x",
            correlationId: "corr-x",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      findExecutionResultByExecutionId: async () => prior,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.execution_result).toEqual(prior);
    expect(runMason).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(0);
  });

  it("probes requestId when executionId does not match", async () => {
    const rec = recorder();
    const runMason = vi.fn();
    const prior: ExecutionResult = {
      execution_id: "exec-found",
      request_id: "req-dup",
      correlation_id: "corr-dup",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    };

    const findByExec = vi.fn(async () => null);
    const findByReq = vi.fn(async () => prior);
    const findByCorr = vi.fn(async () => null);

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-none",
            requestId: "req-dup",
            correlationId: "corr-dup",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      findExecutionResultByExecutionId: findByExec,
      findExecutionResultByRequestId: findByReq,
      findExecutionResultByCorrelationId: findByCorr,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.execution_result).toEqual(prior);
    expect(findByExec).toHaveBeenCalledTimes(1);
    expect(findByReq).toHaveBeenCalledTimes(1);
    expect(findByCorr).not.toHaveBeenCalled();
    expect(runMason).not.toHaveBeenCalled();
  });

  it("probes correlationId after executionId/requestId miss", async () => {
    const rec = recorder();
    const runMason = vi.fn();
    const prior: ExecutionResult = {
      execution_id: "exec-found",
      request_id: "req-found",
      correlation_id: "corr-dup",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    };

    const findByExec = vi.fn(async () => null);
    const findByReq = vi.fn(async () => null);
    const findByCorr = vi.fn(async () => prior);

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-none",
            requestId: "req-none",
            correlationId: "corr-dup",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      findExecutionResultByExecutionId: findByExec,
      findExecutionResultByRequestId: findByReq,
      findExecutionResultByCorrelationId: findByCorr,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.execution_result).toEqual(prior);
    expect(findByExec).toHaveBeenCalledTimes(1);
    expect(findByReq).toHaveBeenCalledTimes(1);
    expect(findByCorr).toHaveBeenCalledTimes(1);
    expect(runMason).not.toHaveBeenCalled();
  });

  it("keeps compatibility for legacy Mason resume payloads with objective+repository only", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/legacy",
      previewUrl: null,
    }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
            status: "approved",
            executionIdentity: {
              executionId: "exec-legacy",
              requestId: "req-legacy",
              correlationId: "corr-legacy",
            },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      recordExecutionResult: rec.fn,
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(runMason).toHaveBeenCalledTimes(1);
    expect(rec.calls).toHaveLength(1);
  });

  it("fails closed for canonical Mason payload without required identity", async () => {
    const rec = recorder();
    const runMason = vi.fn();

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
            status: "approved",
            taskContract: { requestedOutcome: "open_pull_request" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("missing_execution_identity");
    expect(runMason).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]).toMatchObject({
      status: "blocked",
      error: { code: "missing_execution_identity" },
      approval_id: "approval_1",
      required_approval: true,
    });
  });

  it("continues normal Mason execution when identities are present and no match exists", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/99",
      previewUrl: null,
    }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-new",
            requestId: "req-new",
            correlationId: "corr-new",
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
            status: "approved",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "open_pull_request",
            },
          },
        }),
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(runMason).toHaveBeenCalledTimes(1);
    expect(rec.calls).toHaveLength(1);
  });

  it("keeps connector path behavior unchanged", async () => {
    const rec = recorder();
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok" }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_agent: "harmony",
          original_domain: "operations",
          original_action: "create_issue",
          original_params: {
            executionId: "exec-connector",
            requestId: "req-connector",
            correlationId: "corr-connector",
            connectorId: "github",
            capabilityId: "create_issue",
            provider: "github",
            connectionId: "conn-connector",
            status: "approved",
            executionIdentity: {
              executionId: "exec-connector",
              requestId: "req-connector",
              correlationId: "corr-connector",
            },
            params: { repo: "AIOS-HQ/aios-platform" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "harmony",
              domain: "operations",
              action: "create_issue",
              target: {
                connectorId: "github",
                provider: "github",
                capabilityId: "create_issue",
              },
            },
          },
        }),
      getApprovalPayload: async () =>
        payload({
          original_agent: "harmony",
          original_domain: "operations",
          original_action: "create_issue",
          original_params: {
            executionId: "exec-connector",
            requestId: "req-connector",
            correlationId: "corr-connector",
            connectorId: "github",
            capabilityId: "create_issue",
            provider: "github",
            connectionId: "conn-connector",
            status: "approved",
            executionIdentity: {
              executionId: "exec-connector",
              requestId: "req-connector",
              correlationId: "corr-connector",
            },
            params: { repo: "AIOS-HQ/aios-platform" },
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "harmony",
              domain: "operations",
              action: "create_issue",
              target: {
                connectorId: "github",
                provider: "github",
                capabilityId: "create_issue",
              },
            },
          },
        }),
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runConnector,
      runMason: vi.fn(),
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(runConnector).toHaveBeenCalledTimes(1);
    expect(rec.calls).toHaveLength(1);
  });

  it("persists explicit executionId unchanged with requestId and correlationId", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/555",
      previewUrl: null,
    }));

    await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-explicit",
            requestId: "req-explicit",
            correlationId: "corr-explicit",
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
          },
        }),
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.execution_id).toBe("exec-explicit");
    expect(rec.calls[0]?.request_id).toBe("req-explicit");
    expect(rec.calls[0]?.correlation_id).toBe("corr-explicit");
  });

  it("legacy non-Mason path still generates execution_id when none is supplied", async () => {
    const rec = recorder();
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok" }));

    await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_agent: "harmony",
          original_action: "create_issue",
          original_params: {
            connectorId: "github",
            capabilityId: "create_issue",
            params: { repo: "AIOS-HQ/aios-platform" },
          },
        }),
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runConnector,
      runMason: vi.fn(),
      now: () => T0,
    });

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.execution_id).toMatch(/^exec_/);
  });

  it("duplicate lookup can find resulting identity", async () => {
    const rec = recorder();
    const runMason = vi.fn(async () => ({
      status: "completed",
      summary: "Merged",
      pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/777",
      previewUrl: null,
    }));

    const persisted: ExecutionResult = {
      execution_id: "exec-dupe",
      request_id: "req-dupe",
      correlation_id: "corr-dupe",
      agent: "mason",
      domain: "engineering",
      action: "open_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    };

    const first = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-dupe",
            requestId: "req-dupe",
            correlationId: "corr-dupe",
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
            policyDecision: { decision: "approval_required", requiresApproval: true, approvedAt: "2026-07-03T00:00:00.000Z", actor: "agent", agent: "mason", domain: "engineering", action: "open_pull_request" },
          },
        }),
      findExecutionResultByExecutionId: async () => null,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    const second = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "open_pull_request",
          original_params: {
            executionId: "exec-dupe",
            requestId: "req-dupe",
            correlationId: "corr-dupe",
            objective: "Open",
            repository: "AIOS-HQ/aios-platform",
            policyDecision: { decision: "approval_required", requiresApproval: true, approvedAt: "2026-07-03T00:00:00.000Z", actor: "agent", agent: "mason", domain: "engineering", action: "open_pull_request" },
          },
        }),
      findExecutionResultByExecutionId: async () => persisted,
      findExecutionResultByRequestId: async () => null,
      findExecutionResultByCorrelationId: async () => null,
      recordExecutionResult: rec.fn,
      runMason,
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(first.ok).toBe(true);
    expect(second.execution_result?.execution_id).toBe("exec-dupe");
    expect(second.execution_result?.request_id).toBe("req-dupe");
    expect(second.execution_result?.correlation_id).toBe("corr-dupe");
  });

  it("keeps governance validation before prior-result lookup", async () => {
    const rec = recorder();
    const findByExec = vi.fn(async () => ({
      execution_id: "exec-should-not-return",
      request_id: "req-should-not-return",
      correlation_id: "corr-should-not-return",
      agent: "mason",
      domain: "engineering",
      action: "merge_pull_request",
      status: "completed",
      required_approval: true,
      approval_id: "approval_1",
      created_at: T0.toISOString(),
      expires_at: new Date(T0.getTime() + 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    }));

    const outcome = await resumeApprovedExecution("user-1", "approval_1", "company-1", {
      getApprovedApprovalPayload: async () =>
        payload({
          original_action: "merge_pull_request",
          original_params: {
            executionId: "exec-gov",
            requestId: "req-gov",
            correlationId: "corr-gov",
            policyDecision: {
              decision: "approval_required",
              requiresApproval: true,
              approvedAt: "2026-07-03T00:00:00.000Z",
              actor: "agent",
              agent: "mason",
              domain: "engineering",
              action: "merge_pull_request",
            },
          },
        }),
      findExecutionResultByExecutionId: findByExec,
      findExecutionResultByRequestId: vi.fn(async () => null),
      findExecutionResultByCorrelationId: vi.fn(async () => null),
      recordExecutionResult: rec.fn,
      runMason: vi.fn(),
      runConnector: vi.fn(async () => ({ ok: true, status: "executed", message: "ok" })),
      now: () => T0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("invalid_merge_resume_context");
    expect(findByExec).not.toHaveBeenCalled();
  });
});
