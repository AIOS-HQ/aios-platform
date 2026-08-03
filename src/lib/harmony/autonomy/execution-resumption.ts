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
import type { WorkItem } from "@/types/database";

export interface ResumeDeps {
  getApprovalPayload: (userId: string, approvalId: string) => Promise<ApprovalPayload | null>;
  getApprovedApprovalPayload: (userId: string, approvalId: string) => Promise<ApprovalPayload | null>;
  recordExecutionResult: (
    userId: string,
    companyId: string | null,
    result: ExecutionResult,
  ) => Promise<ExecutionResult | null>;
  findExecutionResultByExecutionId: (
    userId: string,
    companyId: string | null,
    executionId: string,
  ) => Promise<ExecutionResult | null>;
  findExecutionResultByRequestId: (
    userId: string,
    companyId: string | null,
    requestId: string,
  ) => Promise<ExecutionResult | null>;
  findExecutionResultByCorrelationId: (
    userId: string,
    companyId: string | null,
    correlationId: string,
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
    taskContract?: Record<string, unknown> | null;
  }) => Promise<{
    status: string;
    summary: string;
    pullRequestUrl: string | null;
    previewUrl: string | null;
  }>;
  runWorkItem: (
    userId: string,
    workItemId: string,
  ) => Promise<"completed" | "awaiting_approval" | "blocked">;
  now: () => Date;
}

function defaultDeps(): ResumeDeps {
  return {
    getApprovalPayload: async (userId, approvalId) =>
      (await import("./data-access")).getApprovalPayload(userId, approvalId),
    getApprovedApprovalPayload: async (userId, approvalId) =>
      (await import("./data-access")).getApprovedApprovalPayload(userId, approvalId),
    recordExecutionResult: async (userId, companyId, result) =>
      (await import("./data-access")).recordExecutionResult(userId, companyId, result),
    findExecutionResultByExecutionId: async (userId, companyId, executionId) =>
      (await import("./data-access")).findExecutionResultByExecutionId(userId, companyId, executionId),
    findExecutionResultByRequestId: async (userId, companyId, requestId) =>
      (await import("./data-access")).findExecutionResultByRequestId(userId, companyId, requestId),
    findExecutionResultByCorrelationId: async (userId, companyId, correlationId) =>
      (await import("./data-access")).findExecutionResultByCorrelationId(userId, companyId, correlationId),
    runConnector: async (userId, connectorId, capabilityId, params, options) =>
      (await import("@/lib/integrations/connector-runtime")).runConnectorCapability(
        userId,
        connectorId,
        capabilityId,
        params,
        options,
      ),
    runMason: async (input) => {
      const task = input.taskContract ?? {};
      const runtimeRequest = asOptionalObject(task.runtimeRequest) ?? {};
      const executionIdentity = asOptionalObject(task.executionIdentity) ?? {};
      const requestedOutcome = typeof task.requestedOutcome === "string" ? task.requestedOutcome : input.openPullRequest ? "open_pull_request" : "plan_only";
      const allowedOutcomes = new Set(["plan_only", "create_issue", "create_branch", "commit_changes", "open_pull_request"]);
      const fileChanges = Array.isArray(runtimeRequest.fileChanges)
        ? runtimeRequest.fileChanges.filter((item): item is { path: string; content: string; message?: string | null } => Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).path === "string" && typeof (item as Record<string, unknown>).content === "string")
        : [];
      return (await import("@/lib/workforce/mason-action")).handleMasonEngineeringMessage({
        userId: input.userId,
        companyId: input.companyId,
        message: input.objective,
        repository: input.repository,
        founderApproved: true,
        requesterAuthorization: { role: "founder", verified: true, source: "approved_payload" },
        correlationId: typeof executionIdentity.correlationId === "string" ? executionIdentity.correlationId : null,
        causationId: typeof executionIdentity.causationId === "string" ? executionIdentity.causationId : null,
        requestedOutcome: (allowedOutcomes.has(requestedOutcome) ? requestedOutcome : "plan_only") as "plan_only" | "create_issue" | "create_branch" | "commit_changes" | "open_pull_request",
        baseBranch: typeof runtimeRequest.baseBranch === "string" ? runtimeRequest.baseBranch : null,
        branchName: typeof runtimeRequest.branchName === "string" ? runtimeRequest.branchName : null,
        fileChanges,
        issueTitle: typeof runtimeRequest.issueTitle === "string" ? runtimeRequest.issueTitle : null,
        issueBody: typeof runtimeRequest.issueBody === "string" ? runtimeRequest.issueBody : null,
        issueLabels: Array.isArray(runtimeRequest.issueLabels) ? runtimeRequest.issueLabels.filter((item): item is string => typeof item === "string") : [],
      });
    },
    runWorkItem: async (userId, workItemId) => {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("work_items")
        .select("*")
        .eq("id", workItemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return "blocked";
      const { executeWorkItem } = await import("@/lib/harmony/os/execution");
      return executeWorkItem(supabase, userId, data as WorkItem, { force: true });
    },
    now: () => new Date(),
  };
}

export interface ResumeOutcome {
  ok: boolean;
  error?: string;
  execution_result?: ExecutionResult;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asOptionalObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractExecutionIdentity(params: Record<string, unknown>): {
  executionId: string | null;
  requestId: string | null;
  correlationId: string | null;
} {
  const taskContract = asOptionalObject(params.taskContract);
  const canonicalExecutionIdentity = asOptionalObject(taskContract?.executionIdentity);
  const legacyExecutionIdentity = asOptionalObject(params.executionIdentity);
  const context = asOptionalObject(params.context);

  const executionId =
    asNonEmptyString(canonicalExecutionIdentity?.executionId) ??
    asNonEmptyString(canonicalExecutionIdentity?.execution_id) ??
    asNonEmptyString(legacyExecutionIdentity?.executionId) ??
    asNonEmptyString(legacyExecutionIdentity?.execution_id) ??
    asNonEmptyString(params.executionId) ??
    asNonEmptyString(params.execution_id) ??
    asNonEmptyString(context?.executionId) ??
    asNonEmptyString(context?.execution_id);

  const requestId =
    asNonEmptyString(canonicalExecutionIdentity?.requestId) ??
    asNonEmptyString(canonicalExecutionIdentity?.request_id) ??
    asNonEmptyString(legacyExecutionIdentity?.requestId) ??
    asNonEmptyString(legacyExecutionIdentity?.request_id) ??
    asNonEmptyString(params.requestId) ??
    asNonEmptyString(params.request_id) ??
    asNonEmptyString(context?.requestId) ??
    asNonEmptyString(context?.request_id);

  const correlationId =
    asNonEmptyString(canonicalExecutionIdentity?.correlationId) ??
    asNonEmptyString(canonicalExecutionIdentity?.correlation_id) ??
    asNonEmptyString(legacyExecutionIdentity?.correlationId) ??
    asNonEmptyString(legacyExecutionIdentity?.correlation_id) ??
    asNonEmptyString(params.correlationId) ??
    asNonEmptyString(params.correlation_id) ??
    asNonEmptyString(context?.correlationId) ??
    asNonEmptyString(context?.correlation_id);

  return { executionId, requestId, correlationId };
}

async function findPriorCanonicalExecution(
  d: ResumeDeps,
  userId: string,
  companyId: string | null,
  identity: { executionId: string | null; requestId: string | null; correlationId: string | null },
): Promise<ExecutionResult | null> {
  if (identity.executionId) {
    const existing = await d.findExecutionResultByExecutionId(userId, companyId, identity.executionId);
    if (existing) return existing;
  }
  if (identity.requestId) {
    const existing = await d.findExecutionResultByRequestId(userId, companyId, identity.requestId);
    if (existing) return existing;
  }
  if (identity.correlationId) {
    const existing = await d.findExecutionResultByCorrelationId(userId, companyId, identity.correlationId);
    if (existing) return existing;
  }
  return null;
}

function parsePullRequestIdentity(params: Record<string, unknown>): {
  repo: string;
  prNumber: number;
  prUrl: string;
  executionId: string | null;
  headSha: string | null;
} | null {
  const repo = asNonEmptyString(params.repo) ?? asNonEmptyString(params.repository);
  const prNumberRaw = params.prNumber;
  const prNumber =
    typeof prNumberRaw === "number" && Number.isFinite(prNumberRaw)
      ? Math.trunc(prNumberRaw)
      : typeof prNumberRaw === "string" && /^\d+$/.test(prNumberRaw.trim())
        ? Number(prNumberRaw.trim())
        : 0;
  const prUrl = asNonEmptyString(params.prUrl) ?? asNonEmptyString(params.pullRequestUrl);
  const executionId = asNonEmptyString(params.executionId) ?? asNonEmptyString(params.execution_id);
  const headSha = asNonEmptyString(params.headSha) ?? asNonEmptyString(params.head_sha);

  if (!repo || !prUrl || prNumber <= 0) return null;
  return { repo, prNumber, prUrl, executionId, headSha };
}

function validateMergeResumePayload(
  approval: ApprovalPayload,
  params: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  if (approval.original_action !== "merge_pull_request") return { ok: true };

  const identity = parsePullRequestIdentity(params);
  if (!identity) {
    return {
      ok: false,
      reason:
        "merge_pull_request requires a concrete pull request identity (repo, prNumber, prUrl) created by this execution.",
    };
  }

  if (identity.repo !== "AIOS-HQ/aios-platform") {
    return {
      ok: false,
      reason: "merge_pull_request is only permitted for AIOS-HQ/aios-platform in Mason governed resume.",
    };
  }

  const parsedUrl = (() => {
    try {
      return new URL(identity.prUrl);
    } catch {
      return null;
    }
  })();
  if (!parsedUrl) {
    return { ok: false, reason: "merge_pull_request payload contains an invalid PR URL." };
  }
  if (parsedUrl.hostname !== "github.com") {
    return { ok: false, reason: "merge_pull_request payload must reference github.com." };
  }
  if (parsedUrl.pathname !== `/AIOS-HQ/aios-platform/pull/${identity.prNumber}`) {
    return {
      ok: false,
      reason: "merge_pull_request payload PR URL does not match repo and pull request number.",
    };
  }

  const context = asOptionalObject(params.context);
  const contextExecutionId = asNonEmptyString(context?.executionId) ?? asNonEmptyString(context?.execution_id);
  if (!identity.executionId || !contextExecutionId || identity.executionId !== contextExecutionId) {
    return {
      ok: false,
      reason: "merge_pull_request payload must include matching execution_id context before resume is allowed.",
    };
  }

  const mergeReady = params.mergeReady === true;
  const requiredChecksPassed = params.requiredChecksPassed === true;
  if (!mergeReady || !requiredChecksPassed) {
    return {
      ok: false,
      reason: "merge_pull_request resume blocked: required merge gate evidence is incomplete.",
    };
  }

  if (!identity.headSha) {
    return {
      ok: false,
      reason: "merge_pull_request resume blocked: approved artifact head SHA is missing.",
    };
  }

  return { ok: true };
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
  identity: { executionId: string | null; requestId: string | null; correlationId: string | null },
  status: ExecutionResult["status"],
  error?: ExecutionResult["error"],
  resultData?: Record<string, unknown>,
): Promise<ExecutionResult | null> {
  const now = d.now();
  const rejected = status === "blocked" && error?.code === "rejected";
  const result: ExecutionResult = {
    execution_id: identity.executionId ?? executionId(),
    request_id: identity.requestId ?? undefined,
    correlation_id: identity.correlationId ?? undefined,
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

  const approval = await d.getApprovedApprovalPayload(userId, approvalId);
  if (!approval) {
    return { ok: false, error: "approval_not_found_or_not_approved" };
  }

  // Expired approvals can never resume.
  const expiresAt = new Date(approval.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < d.now().getTime()) {
    const expiredIdentity = extractExecutionIdentity((approval.original_params ?? {}) as Record<string, unknown>);
    const result = await recordResult(d, userId, companyId, approval, expiredIdentity, "blocked", {
      code: "expired",
      message: `Approval ${approvalId} expired at ${approval.expires_at}; cannot resume.`,
      recoverable: false,
    });
    return { ok: false, error: "expired", execution_result: result ?? undefined };
  }

  const params = (approval.original_params ?? {}) as Record<string, unknown>;
  const identity = extractExecutionIdentity(params);

  const mergeValidation = validateMergeResumePayload(approval, params);
  if (!mergeValidation.ok) {
    const result = await recordResult(d, userId, companyId, approval, identity, "blocked", {
      code: "invalid_merge_resume_context",
      message: mergeValidation.reason,
      recoverable: true,
    });
    return { ok: false, error: "invalid_merge_resume_context", execution_result: result ?? undefined };
  }

  if (
    approval.original_agent === "mason" &&
    !identity.executionId &&
    !identity.requestId &&
    !identity.correlationId
  ) {
    const result = await recordResult(d, userId, companyId, approval, identity, "blocked", {
      code: "missing_execution_identity",
      message: `Approval ${approvalId} cannot resume: execution identity is missing from approved payload.`,
      recoverable: false,
    });
    return {
      ok: false,
      error: "missing_execution_identity",
      execution_result: result ?? undefined,
    };
  }

  const prior = await findPriorCanonicalExecution(d, userId, companyId, identity);
  if (prior) {
    return {
      ok: prior.status === "completed",
      error: prior.status === "completed" ? undefined : prior.error?.message,
      execution_result: prior,
    };
  }

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
        identity,
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
        taskContract: asOptionalObject(params.taskContract),
      });
      const status: ExecutionResult["status"] =
        masonRes.status === "completed" ? "completed" : masonRes.status === "blocked" ? "blocked" : "failed";
      const result = await recordResult(
        d,
        userId,
        companyId,
        approval,
        identity,
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

    // Work-item dispatch — payload carries a work item id (generic Harmony work).
    if (typeof params.workItemId === "string") {
      const outcome = await d.runWorkItem(userId, params.workItemId);
      const status: ExecutionResult["status"] =
        outcome === "completed"
          ? "completed"
          : outcome === "awaiting_approval"
            ? "pending_approval"
            : "blocked";
      const result = await recordResult(
        d,
        userId,
        companyId,
        approval,
        identity,
        status,
        outcome === "completed"
          ? undefined
          : {
              code: outcome,
              message: `Work item ${params.workItemId} resumed with outcome: ${outcome}.`,
              recoverable: outcome !== "blocked",
            },
        { workItemId: params.workItemId, outcome },
      );
      return {
        ok: outcome === "completed",
        error: outcome === "completed" ? undefined : outcome,
        execution_result: result ?? undefined,
      };
    }

    // No handler for this actor/agent.
    const result = await recordResult(d, userId, companyId, approval, identity, "blocked", {
      code: "unsupported_agent",
      message: `No resumption handler for ${approval.original_agent}/${approval.original_domain}.`,
      recoverable: false,
    });
    return { ok: false, error: "unsupported_agent", execution_result: result ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "resume_failed";
    const result = await recordResult(d, userId, companyId, approval, identity, "failed", {
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
  const identity = extractExecutionIdentity((approval.original_params ?? {}) as Record<string, unknown>);
  return recordResult(d, userId, companyId, approval, identity, "blocked", {
    code: "rejected",
    message: reason || "Founder rejected the action.",
    recoverable: false,
  });
}
