import {
  canTransitionMasonRuntimeState,
  transitionMasonRuntimeState,
  type MasonRuntimeState,
} from "@/lib/harmony/code/mason-runtime-state";
import type { MasonLiveConnectorOperation } from "@/lib/harmony/code/mason-live-execution";
import type {
  MasonRuntimeExecutionResult,
  MasonRuntimeExecutorAdapters,
} from "@/lib/harmony/code/mason-runtime-executor";

export type MasonRollbackTrigger =
  | "branch_creation_failure"
  | "file_mutation_failure"
  | "commit_failure"
  | "pull_request_creation_failure"
  | "validation_failure"
  | "preview_deployment_failure"
  | "reporting_failure"
  | "connector_failure"
  | "unexpected_runtime_failure"
  | "founder_requested_cancellation";

export type MasonRecoveryOutcome =
  | "recovered"
  | "partially_recovered"
  | "manual_intervention_required"
  | "rollback_failed"
  | "cancelled_safely";

export type MasonCompensationKind =
  | "noop"
  | "close_pull_request"
  | "mark_branch_for_cleanup"
  | "record_preview_failure"
  | "record_validation_failure"
  | "emit_compensating_report";

export interface MasonCompensationOperation {
  id: string;
  kind: MasonCompensationKind;
  scope: "github" | "vercel" | "harmony" | "runtime";
  summary: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  safeToRetry: boolean;
}

export interface MasonRollbackRequest {
  executionId: string;
  repository: string;
  branch: string | null;
  trigger: MasonRollbackTrigger;
  founderRequestedCancellation?: boolean;
}

export interface MasonRollbackPlan {
  executionId: string;
  trigger: MasonRollbackTrigger;
  initialState: MasonRuntimeState;
  targetState: MasonRuntimeState;
  operations: MasonCompensationOperation[];
  summary: string;
}

export interface MasonRollbackStepResult {
  operation: MasonCompensationOperation;
  status: "completed" | "failed" | "skipped";
  message: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface MasonRollbackResult {
  executionId: string;
  trigger: MasonRollbackTrigger;
  outcome: MasonRecoveryOutcome;
  fromState: MasonRuntimeState;
  toState: MasonRuntimeState;
  steps: MasonRollbackStepResult[];
  summary: string;
  manualActions: string[];
}

export interface MasonRollbackExecutionContext {
  runtime: MasonRuntimeExecutionResult;
  adapters: MasonRuntimeExecutorAdapters;
  operationScopeId: string;
  alreadyCompensated?: Set<string>;
}

function buildCompensationId(executionId: string, kind: MasonCompensationKind): string {
  return `${executionId}:${kind}`;
}

function hasOperation(runtime: MasonRuntimeExecutionResult, kind: MasonLiveConnectorOperation["kind"]): boolean {
  return runtime.results.some((result) => result.operation.kind === kind);
}

function findOutput(runtime: MasonRuntimeExecutionResult, kind: MasonLiveConnectorOperation["kind"]): Record<string, unknown> | undefined {
  return runtime.results.find((result) => result.operation.kind === kind)?.output;
}

function resolveBranch(runtime: MasonRuntimeExecutionResult): string | null {
  const output = findOutput(runtime, "github_create_branch");
  const branch = output?.branch;
  return typeof branch === "string" && branch.trim().length > 0 ? branch : null;
}

function resolvePrNumber(runtime: MasonRuntimeExecutionResult): number | null {
  const output = findOutput(runtime, "github_open_pull_request");
  const prNumber = output?.pr_number ?? output?.number;
  return typeof prNumber === "number" ? prNumber : null;
}

export function classifyRollbackTrigger(runtime: MasonRuntimeExecutionResult, founderRequestedCancellation = false): MasonRollbackTrigger {
  if (founderRequestedCancellation) return "founder_requested_cancellation";

  const firstFailure = runtime.results.find((result) => result.status === "failed" || result.status === "blocked");
  if (!firstFailure) return "unexpected_runtime_failure";

  switch (firstFailure.operation.kind) {
    case "github_create_branch":
      return "branch_creation_failure";
    case "github_commit_file":
      return "file_mutation_failure";
    case "github_open_pull_request":
      return "pull_request_creation_failure";
    case "validation_request":
      return "validation_failure";
    case "vercel_check_preview":
      return "preview_deployment_failure";
    case "harmony_report_outcome":
    case "activity_record":
    case "review_queue_update":
    case "julius_memory_update":
    case "company_skill_update":
      return "reporting_failure";
    default:
      return "connector_failure";
  }
}

export function createMasonRollbackPlan(input: {
  request: MasonRollbackRequest;
  runtime: MasonRuntimeExecutionResult;
}): MasonRollbackPlan {
  const initialState: MasonRuntimeState = "executing";
  const targetState: MasonRuntimeState = "recovered";

  const operations: MasonCompensationOperation[] = [];
  const prNumber = resolvePrNumber(input.runtime);
  const branch = input.request.branch ?? resolveBranch(input.runtime);

  if (prNumber) {
    operations.push({
      id: buildCompensationId(input.request.executionId, "close_pull_request"),
      kind: "close_pull_request",
      scope: "github",
      summary: `Close incomplete PR #${prNumber}.`,
      params: {
        repository: input.request.repository,
        pr_number: prNumber,
      },
      idempotencyKey: `${input.request.executionId}:close_pr:${prNumber}`,
      safeToRetry: true,
    });
  }

  if (branch && input.runtime.results.some((result) => result.operation.kind === "github_create_branch")) {
    operations.push({
      id: buildCompensationId(input.request.executionId, "mark_branch_for_cleanup"),
      kind: "mark_branch_for_cleanup",
      scope: "harmony",
      summary: `Mark execution branch ${branch} for founder-reviewed cleanup.`,
      params: {
        repository: input.request.repository,
        branch,
      },
      idempotencyKey: `${input.request.executionId}:branch_cleanup:${branch}`,
      safeToRetry: true,
    });
  }

  if (hasOperation(input.runtime, "vercel_check_preview") && input.runtime.results.length > 0) {
    operations.push({
      id: buildCompensationId(input.request.executionId, "record_preview_failure"),
      kind: "record_preview_failure",
      scope: "vercel",
      summary: "Record preview failure/invalidation for founder review.",
      params: {
        repository: input.request.repository,
        branch,
        preview_url: input.runtime.previewUrl,
      },
      idempotencyKey: `${input.request.executionId}:preview_failure`,
      safeToRetry: true,
    });
  }

  if (hasOperation(input.runtime, "validation_request") && input.runtime.results.length > 0) {
    operations.push({
      id: buildCompensationId(input.request.executionId, "record_validation_failure"),
      kind: "record_validation_failure",
      scope: "harmony",
      summary: "Record validation failure and pause execution for founder review.",
      params: {
        repository: input.request.repository,
        branch,
      },
      idempotencyKey: `${input.request.executionId}:validation_failure`,
      safeToRetry: true,
    });
  }

  if (input.runtime.results.length > 0) {
    operations.push({
      id: buildCompensationId(input.request.executionId, "emit_compensating_report"),
      kind: "emit_compensating_report",
      scope: "harmony",
    summary: "Emit compensating rollback report, review queue update, and audit evidence.",
    params: {
      repository: input.request.repository,
      branch,
      trigger: input.request.trigger,
      execution_status: input.runtime.status,
    },
      idempotencyKey: `${input.request.executionId}:compensating_report`,
      safeToRetry: true,
    });
  }

  if (operations.length === 0) {
    operations.unshift({
      id: buildCompensationId(input.request.executionId, "noop"),
      kind: "noop",
      scope: "runtime",
      summary: "No rollback mutations required; nothing external was created.",
      params: {},
      idempotencyKey: `${input.request.executionId}:noop`,
      safeToRetry: true,
    });
  }

  return {
    executionId: input.request.executionId,
    trigger: input.request.trigger,
    initialState,
    targetState,
    operations,
    summary: `Mason rollback plan prepared for ${input.request.trigger} with ${operations.length} compensation step(s).`,
  };
}

async function executeCompensation(
  operation: MasonCompensationOperation,
  adapters: MasonRuntimeExecutorAdapters,
): Promise<{ output?: Record<string, unknown>; error?: string }> {
  try {
    switch (operation.kind) {
      case "noop":
        return { output: { noop: true } };
      case "close_pull_request": {
        const params = operation.params as { repository: string; pr_number: number };
        if (!adapters.github.closePullRequest) {
          return {
            error: "GitHub closePullRequest capability is unavailable for rollback compensation.",
          };
        }
        const output = await adapters.github.closePullRequest({
          repository: params.repository,
          prNumber: params.pr_number,
        });
        return { output };
      }
      case "mark_branch_for_cleanup":
        return {
          output: await adapters.harmony.updateReviewQueue({
            kind: "rollback_branch_cleanup",
            ...operation.params,
          }),
        };
      case "record_preview_failure":
        return {
          output: await adapters.harmony.reportOutcome({
            kind: "rollback_preview_failure",
            ...operation.params,
          }),
        };
      case "record_validation_failure":
        return {
          output: await adapters.harmony.reportOutcome({
            kind: "rollback_validation_failure",
            ...operation.params,
          }),
        };
      case "emit_compensating_report": {
        const report = await adapters.harmony.reportOutcome({
          kind: "rollback_compensation_report",
          ...operation.params,
        });
        await adapters.harmony.recordActivity({
          kind: "rollback_compensation_activity",
          ...operation.params,
        });
        await adapters.harmony.updateReviewQueue({
          kind: "rollback_compensation_review_queue",
          ...operation.params,
        });
        await adapters.harmony.updateJuliusMemory({
          kind: "rollback_compensation_julius",
          ...operation.params,
        });
        await adapters.harmony.updateCompanySkills({
          kind: "rollback_compensation_company_skills",
          ...operation.params,
        });
        return { output: report };
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown rollback error.",
    };
  }
}

export function resolveRollbackOutcome(input: {
  trigger: MasonRollbackTrigger;
  steps: MasonRollbackStepResult[];
}): MasonRecoveryOutcome {
  if (input.trigger === "founder_requested_cancellation") return "cancelled_safely";
  if (input.steps.length === 0) return "manual_intervention_required";

  const failed = input.steps.filter((step) => step.status === "failed");
  const completed = input.steps.filter((step) => step.status === "completed");

  if (failed.length === 0) return "recovered";
  if (completed.length > 0) return "partially_recovered";
  return "rollback_failed";
}

export async function executeMasonRollbackPlan(
  plan: MasonRollbackPlan,
  context: MasonRollbackExecutionContext,
): Promise<MasonRollbackResult> {
  const steps: MasonRollbackStepResult[] = [];
  const completed = context.alreadyCompensated ?? new Set<string>();

  if (!canTransitionMasonRuntimeState(plan.initialState, "rollback_pending")) {
    return {
      executionId: plan.executionId,
      trigger: plan.trigger,
      outcome: "manual_intervention_required",
      fromState: plan.initialState,
      toState: "recovery_failed",
      steps: [],
      summary: `Rollback cannot start from runtime state ${plan.initialState}.`,
      manualActions: ["Founder review required: illegal rollback entry state."],
    };
  }

  const pendingToRolling = transitionMasonRuntimeState("rollback_pending", "rolling_back");
  if (!pendingToRolling.ok) {
    return {
      executionId: plan.executionId,
      trigger: plan.trigger,
      outcome: "rollback_failed",
      fromState: "rollback_pending",
      toState: "recovery_failed",
      steps: [],
      summary: pendingToRolling.reason,
      manualActions: ["Founder review required: rollback state transition failed."],
    };
  }

  for (const operation of plan.operations) {
    if (completed.has(operation.idempotencyKey)) {
      steps.push({
        operation,
        status: "skipped",
        message: `Skipped already compensated step ${operation.kind}.`,
      });
      continue;
    }

    const result = await executeCompensation(operation, context.adapters);
    if (result.error) {
      steps.push({
        operation,
        status: "failed",
        message: `Compensation failed for ${operation.kind}.`,
        error: result.error,
      });
      if (!operation.safeToRetry) break;
      continue;
    }

    completed.add(operation.idempotencyKey);
    steps.push({
      operation,
      status: "completed",
      message: `Compensation completed for ${operation.kind}.`,
      output: result.output,
    });
  }

  const outcome = resolveRollbackOutcome({ trigger: plan.trigger, steps });
  const finalState: MasonRuntimeState =
    outcome === "recovered" || outcome === "cancelled_safely"
      ? "recovered"
      : "recovery_failed";

  const rollingToFinal = transitionMasonRuntimeState("rolling_back", finalState);
  const summary = `${plan.summary} Outcome: ${outcome}.`;

  return {
    executionId: plan.executionId,
    trigger: plan.trigger,
    outcome,
    fromState: plan.initialState,
    toState: rollingToFinal.ok ? finalState : "recovery_failed",
    steps,
    summary: rollingToFinal.ok ? summary : `${summary} ${rollingToFinal.reason}`,
    manualActions:
      outcome === "recovered" || outcome === "cancelled_safely"
        ? []
        : [
            "Founder review required for unresolved rollback steps.",
            "Do not delete branch/PR evidence until reviewed.",
          ],
  };
}
