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
    original_params: { objective: "Merge the release PR", repository: "AIOS-HQ/aios-platform" },
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
      original_params: { objective: "Delete the repo", repository: "AIOS-HQ/aios-platform" },
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
      getApprovalPayload: async () => payload(),
      recordExecutionResult: rec.fn,
      runMason,
      runConnector,
      now: () => T0,
    });

    expect(outcome.ok).toBe(true);
    expect(runMason).toHaveBeenCalledTimes(1);
    expect(runMason).toHaveBeenCalledWith(
      expect.objectContaining({
        founderApproved: true,
        objective: "Merge the release PR",
        repository: "AIOS-HQ/aios-platform",
      }),
    );
    expect(runConnector).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]).toMatchObject({ status: "completed", required_approval: true, approval_id: "approval_1" });
  });

  it("scenario 3b — approve resumes a connector execution with approved=true", async () => {
    const rec = recorder();
    const runConnector = vi.fn(async () => ({ ok: true, status: "executed", message: "ok", data: { number: 42 } }));

    const outcome = await resumeApprovedExecution("user-1", "approval_conn", null, {
      getApprovalPayload: async () =>
        payload({
          approval_id: "approval_conn",
          original_agent: "harmony",
          original_domain: "operations",
          original_action: "publish_externally",
          original_params: { connectorId: "github", capabilityId: "create_issue", params: { repo: "AIOS-HQ/aios-platform" } },
        }),
      recordExecutionResult: rec.fn,
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
});
