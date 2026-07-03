/**
 * Unified Autonomy Policy Engine — Execution resumption.
 *
 * When a Founder approves a paused action, this module resumes the EXACT saved
 * execution: it loads the pending approval payload, refuses to resume if the
 * approval has expired, dispatches the saved action back into its runtime
 * (Mason or connector) with approval granted, and records an execution_result.
 *
 * Dependencies are injected (with real defaults) so the resume/reject spine is
 * unit-testable without a database or the heavy runtime modules — the defaults
 * lazily `import()` data-access and the runtimes only when actually invoked.
 */

import "server-only";

import type { ApprovalPayload, ExecutionResult } from "./types";

export interface ResumeDeps {
  getApprovalPayload: (userId: string, approvalId: string) => Promise<ApprovalPayload | null>;
  recordExecutionResult: (
    userId: string,
    companyId: string | null,
    result: ExecutionResult,
  ) => Promise<ExecutionResult | null>;
  runConnector: (
    userId: string,
    connectorId: string,
    capabilityId: string,
    params: Record<string, unknown>,
    options: { approved?: boolean },
  ) => Promise<{ ok: boolean; status: string; message: string; data?: Record<string, unknown> }>;
  runMason: (input: {
    userId: string;
    companyId?: string | null;
    objective: string;
    repository: string;
    founderApproved: boolean;
    openPullRequest?: boolean;
  }) => Promise<{
    status: string;
    summary: string;
    pullRequestUrl: string | null;
    previewUrl: string | null;
  }>;
  now: () => Date;
}

function defaultDeps(): ResumeDeps {
  return {
    getApprovalPayload: async (userId, approvalId) =>
      (await import("./data-access")).getApprovalPayload(userId, approvalId),
    recordExecutionResult: async (userId, companyId, result) =>
      (await import("./data-access")).recordExecutionResult(userId, companyId, result),
    runConnector: async (userId, connectorId, capabilityId, params, options) =>
      (await import("@/lib/integrations/connector-runtime")).runConnectorCapability(
        userId,
        connectorId,
        capabilityId,
        params,
        options,
      ),
    runMason: async (input) =>
      (await import("@/lib/harmony/code/mason-production-runtime")).runMasonProductionRuntime(input),
    now: () => new Date(),
  };
}

export interface ResumeOutcome {
  ok: boolean;
  error?: string;
  execution_result?: ExecutionResult;
}

function executionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ninetyDaysFrom(now: Date): string {
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

async function recordResult(
  d: ResumeDeps,
  userId: string,
  companyId: string | null,
  approval: ApprovalPayload,
  status: ExecutionResult["status"],
  error?: ExecutionResult["error"],
  resultData?: Record<string, unknown>,
): Promise<ExecutionResult | null> {
  const now = d.now();
  const rejected = status === "blocked" && error?.code === "rejected";
  const result: ExecutionResult = {
    execution_id: executionId(),
    agent: approval.original_agent,
    domain: approval.original_domain,
    action: approval.original_action,
    status,
    required_approval: true,
    approval_id: approval.approval_id,
    founder_approved_at: rejected ? undefined : now.toISOString(),
    completed_at: status === "completed" ? now.toISOString() : undefined,
    result_data: resultData,
    error,
    created_at: now.toISOString(),
    expires_at: ninetyDaysFrom(now),
    emitted_to: ["activity_feed", "review_queue"],
  };
  return d.recordExecutionResult(userId, companyId, result);
}

/**
 * Resume a paused execution after Founder approval.
 *
 * Loads the still-pending payload, blocks resumption of expired approvals,
 * dispatches to the original runtime with approval granted, and records the
 * result. It does NOT flip the payload's approved flag — the caller marks it
 * approved only after a successful resume, so a failed resume stays retryable.
 */
export async function resumeApprovedExecution(
  userId: string,
  approvalId: string,
  companyId: string | null = null,
  deps: Partial<ResumeDeps> = {},
): Promise<ResumeOutcome> {
  const d: ResumeDeps = { ...defaultDeps(), ...deps };

  const approval = await d.getApprovalPayload(userId, approvalId);
  if (!approval) {
    return { ok: false, error: "approval_not_found_or_not_pending" };
  }

  // Expired approvals can never resume.
  const expiresAt = new Date(approval.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < d.now().getTime()) {
    const result = await recordResult(d, userId, companyId, approval, "blocked", {
      code: "expired",
      message: `Approval ${approvalId} expired at ${approval.expires_at}; cannot resume.`,
      recoverable: false,
    });
    return { ok: false, error: "expired", execution_result: result ?? undefined };
  }

  const params = (approval.original_params ?? {}) as Record<string, unknown>;

  try {
    // Connector dispatch — payload carries connectorId + capabilityId.
    if (typeof params.connectorId === "string" && typeof params.capabilityId === "string") {
      const run = await d.runConnector(
        userId,
        params.connectorId,
        params.capabilityId,
        (params.params as Record<string, unknown> | undefined) ?? {},
        { approved: true },
      );
      const status: ExecutionResult["status"] = run.ok
        ? "completed"
        : run.status === "blocked"
          ? "blocked"
          : "failed";
      const result = await recordResult(
        d,
        userId,
        companyId,
        approval,
        status,
        run.ok ? undefined : { code: run.status, message: run.message, recoverable: true },
        run.data,
      );
      return { ok: run.ok, error: run.ok ? undefined : run.message, execution_result: result ?? undefined };
    }

    // Mason dispatch — payload carries objective + repository.
    if (approval.original_agent === "mason") {
      const objective = typeof params.objective === "string" ? params.objective : "";
      const repository = typeof params.repository === "string" ? params.repository : "";
      const masonRes = await d.runMason({
        userId,
        companyId,
        objective,
        repository,
        founderApproved: true,
        openPullRequest: params.openPullRequest === true,
      });
      const status: ExecutionResult["status"] =
        masonRes.status === "completed" ? "completed" : masonRes.status === "blocked" ? "blocked" : "failed";
      const result = await recordResult(
        d,
        userId,
        companyId,
        approval,
        status,
        masonRes.status === "completed"
          ? undefined
          : { code: masonRes.status, message: masonRes.summary, recoverable: true },
        { summary: masonRes.summary, pullRequestUrl: masonRes.pullRequestUrl, previewUrl: masonRes.previewUrl },
      );
      return {
        ok: masonRes.status === "completed",
        error: masonRes.status === "completed" ? undefined : masonRes.summary,
        execution_result: result ?? undefined,
      };
    }

    // No handler for this actor/agent.
    const result = await recordResult(d, userId, companyId, approval, "blocked", {
      code: "unsupported_agent",
      message: `No resumption handler for ${approval.original_agent}/${approval.original_domain}.`,
      recoverable: false,
    });
    return { ok: false, error: "unsupported_agent", execution_result: result ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "resume_failed";
    const result = await recordResult(d, userId, companyId, approval, "failed", {
      code: "resume_exception",
      message,
      recoverable: true,
    });
    return { ok: false, error: message, execution_result: result ?? undefined };
  }
}

/**
 * Record a blocked execution_result for a Founder-rejected approval. Called by
 * rejectActionAction after the payload's status is set to rejected.
 */
export async function recordRejectedExecution(
  userId: string,
  approval: ApprovalPayload,
  reason: string,
  companyId: string | null = null,
  deps: Partial<ResumeDeps> = {},
): Promise<ExecutionResult | null> {
  const d: ResumeDeps = { ...defaultDeps(), ...deps };
  return recordResult(d, userId, companyId, approval, "blocked", {
    code: "rejected",
    message: reason || "Founder rejected the action.",
    recoverable: false,
  });
}
