import type { MasonBridgeStatus } from "@/lib/harmony/code/mason-execution-bridge";
import type { MasonValidationRequirementId } from "@/lib/harmony/code/mason-validation-policy";
import type { CiRequiredCheckClassification } from "@/lib/workforce/mason-ci-watch";

export type MasonRuntimeState =
  | "blocked"
  | "awaiting_founder_approval"
  | "ready"
  | "executing"
  | "rollback_pending"
  | "rolling_back"
  | "completed"
  | "recovered"
  | "recovery_failed"
  | "failed";

export const MASON_RUNTIME_TERMINAL_STATES: readonly MasonRuntimeState[] = [
  "blocked",
  "completed",
  "failed",
] as const;

const LEGAL_TRANSITIONS: Record<MasonRuntimeState, readonly MasonRuntimeState[]> = {
  blocked: [],
  awaiting_founder_approval: ["ready", "blocked"],
  ready: ["executing", "blocked"],
  executing: ["completed", "failed", "blocked", "rollback_pending"],
  rollback_pending: ["rolling_back", "recovery_failed"],
  rolling_back: ["recovered", "recovery_failed"],
  completed: [],
  recovered: [],
  recovery_failed: [],
  failed: [],
};

export interface MasonRuntimeTransitionResult {
  ok: boolean;
  from: MasonRuntimeState;
  to: MasonRuntimeState;
  reason: string;
}

export type MasonValidationLifecycleState =
  | "requested"
  | "discovered"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "stale"
  | "incomplete"
  | "blocked";

export type MasonValidationFailureCode =
  | "tests_failed"
  | "typecheck_failed"
  | "lint_failed"
  | "i18n_failed"
  | "build_failed"
  | "workflow_failed"
  | "deployment_failed"
  | "missing_required_check"
  | "stale_evidence"
  | "ambiguous_evidence"
  | "wrong_repository"
  | "wrong_pr"
  | "wrong_branch"
  | "head_sha_mismatch"
  | "authentication_failed"
  | "authorization_failed"
  | "infrastructure_failure"
  | "timeout"
  | "cancelled"
  | "unknown_failure";

export type MasonValidationFailure = {
  code: MasonValidationFailureCode;
  validationClass: MasonValidationRequirementId | "workflow" | "deployment" | "unknown";
  checkId?: string | null;
  workflowId?: string | null;
  stage: "ci" | "preview" | "runtime";
  retriable: boolean;
  confidence: number;
  evidenceRef?: string | null;
  limitation?: string;
};

export type MasonValidationLifecycleBinding = {
  executionId: string;
  correlationId: string;
  repository: string;
  prNumber: number | null;
  branch: string | null;
  expectedHeadSha: string | null;
  observedHeadSha: string | null;
  requiredValidationIds: MasonValidationRequirementId[];
  observedCheckClassifications: CiRequiredCheckClassification[];
  evidenceTimestamp: string;
  state: MasonValidationLifecycleState;
  terminalState: Extract<MasonValidationLifecycleState, "passed" | "failed" | "cancelled" | "timed_out" | "stale" | "incomplete" | "blocked"> | null;
  safeEvidenceReferences: string[];
  failure?: MasonValidationFailure | null;
};

export function mapCiStatusToValidationState(status: string): MasonValidationLifecycleState {
  switch (status) {
    case "pending":
      return "running";
    case "passed":
      return "passed";
    case "timeout":
      return "timed_out";
    case "stale_head":
    case "superseded":
      return "stale";
    case "missing_pr":
      return "incomplete";
    case "wrong_repository":
    case "wrong_pr":
    case "wrong_branch":
    case "unrecognized_required_checks":
    case "foreign_repository":
    case "ambiguous_workflow_source":
      return "blocked";
    case "evidence_fetch_failed":
      return "incomplete";
    case "failed":
    default:
      return "failed";
  }
}

export function classifyValidationFailure(input: {
  detail?: string | null;
  status: string;
  checkName?: string | null;
  checkId?: string | null;
  workflowId?: string | null;
  evidenceRef?: string | null;
}): MasonValidationFailure {
  const detail = (input.detail ?? "").toLowerCase();
  const checkName = (input.checkName ?? "").toLowerCase();
  const base = {
    checkId: input.checkId ?? null,
    workflowId: input.workflowId ?? null,
    evidenceRef: input.evidenceRef ?? null,
    confidence: 0.9,
  };

  if (detail.includes("wrong_repository")) return { ...base, code: "wrong_repository", validationClass: "unknown", stage: "ci", retriable: false, limitation: "repository_mismatch" };
  if (detail.includes("wrong_pr")) return { ...base, code: "wrong_pr", validationClass: "unknown", stage: "ci", retriable: false, limitation: "pull_request_mismatch" };
  if (detail.includes("wrong_branch")) return { ...base, code: "wrong_branch", validationClass: "unknown", stage: "ci", retriable: false, limitation: "branch_mismatch" };
  if (detail.includes("stale") || detail.includes("superseded")) return { ...base, code: "stale_evidence", validationClass: "workflow", stage: "ci", retriable: true, limitation: "head_sha_outdated" };
  if (detail.includes("missing_required_check") || detail.includes("required_checks_missing")) return { ...base, code: "missing_required_check", validationClass: "unknown", stage: "ci", retriable: false, limitation: "required_check_absent" };
  if (detail.includes("ambiguous")) return { ...base, code: "ambiguous_evidence", validationClass: "workflow", stage: "ci", retriable: false, limitation: "provenance_ambiguous" };
  if (detail.includes("timeout")) return { ...base, code: "timeout", validationClass: "workflow", stage: "ci", retriable: true, limitation: "poll_timeout" };
  if (detail.includes("cancel")) return { ...base, code: "cancelled", validationClass: "workflow", stage: "ci", retriable: true, limitation: "workflow_cancelled" };
  if (detail.includes("authorization")) return { ...base, code: "authorization_failed", validationClass: "workflow", stage: "runtime", retriable: false, limitation: "authorization_denied" };
  if (detail.includes("auth")) return { ...base, code: "authentication_failed", validationClass: "workflow", stage: "runtime", retriable: true, limitation: "authentication_missing" };
  if (checkName.includes("lint")) return { ...base, code: "lint_failed", validationClass: "lint", stage: "ci", retriable: true, limitation: "lint_failed" };
  if (checkName.includes("type")) return { ...base, code: "typecheck_failed", validationClass: "typecheck", stage: "ci", retriable: true, limitation: "typecheck_failed" };
  if (checkName.includes("i18n")) return { ...base, code: "i18n_failed", validationClass: "i18n", stage: "ci", retriable: true, limitation: "i18n_failed" };
  if (checkName.includes("build")) return { ...base, code: "build_failed", validationClass: "build", stage: "ci", retriable: true, limitation: "build_failed" };
  if (checkName.includes("test")) return { ...base, code: "tests_failed", validationClass: "tests", stage: "ci", retriable: true, limitation: "tests_failed" };
  return { ...base, code: "unknown_failure", validationClass: "unknown", stage: "ci", retriable: true, limitation: "unknown_failure_shape" };
}

export function normalizeMasonRuntimeState(
  state: MasonRuntimeState | MasonBridgeStatus | "pending_approval",
): MasonRuntimeState {
  if (state === "paused_for_founder_approval" || state === "pending_approval") {
    return "awaiting_founder_approval";
  }
  return state as MasonRuntimeState;
}

export function toMasonBridgeStatus(state: MasonRuntimeState): MasonBridgeStatus {
  switch (state) {
    case "awaiting_founder_approval":
      return "paused_for_founder_approval";
    case "ready":
      return "ready";
    default:
      return "blocked";
  }
}

export function isMasonTerminalState(state: MasonRuntimeState): boolean {
  return (MASON_RUNTIME_TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransitionMasonRuntimeState(
  from: MasonRuntimeState,
  to: MasonRuntimeState,
): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function transitionMasonRuntimeState(
  from: MasonRuntimeState,
  to: MasonRuntimeState,
): MasonRuntimeTransitionResult {
  if (from === to) {
    return {
      ok: true,
      from,
      to,
      reason: `Mason runtime remains in ${to}.`,
    };
  }
  if (!canTransitionMasonRuntimeState(from, to)) {
    return {
      ok: false,
      from,
      to,
      reason: `Invalid Mason runtime transition: ${from} -> ${to}.`,
    };
  }
  return {
    ok: true,
    from,
    to,
    reason: `Mason runtime transitioned ${from} -> ${to}.`,
  };
}
