import "server-only";

export type FounderRuntimeSource =
  | "harmony_operator"
  | "approval_center"
  | "approval_resume"
  | "founder_reporting"
  | "unknown";

export type FounderRuntimeApprovalRequirement = "required" | "not_required";

export interface FounderOperationalRequest {
  requestId: string;
  correlationId: string;
  founderId: string;
  source: FounderRuntimeSource;
  intent: string;
  requestedAction: string;
  targetAgent: string;
  capabilityId: string;
  payload: Record<string, unknown>;
  approvalRequirement: FounderRuntimeApprovalRequirement;
  submittedAt: string;
}

export type FounderRuntimeExecutionState =
  | "pending"
  | "waiting_for_approval"
  | "ready"
  | "executing"
  | "capturing_evidence"
  | "recording_ledger"
  | "completed"
  | "failed"
  | "rolled_back"
  | "blocked"
  | "unknown";

export type FounderRuntimeApprovalState = "approved" | "required" | "missing" | "unknown";
export type FounderRuntimeGovernanceState = "allowed" | "rejected" | "unknown";
export type FounderRuntimeState = "healthy" | "degraded" | "blocked" | "unknown";
export type FounderEvidenceStatus = "verified" | "pending" | "missing" | "unknown";
export type FounderLedgerStatus = "recorded" | "pending" | "failed" | "unknown";

export interface FounderRuntimeStatusEnvelope {
  executionId: string;
  requestId: string;
  correlationId: string;
  state: FounderRuntimeExecutionState;
  approvalState: FounderRuntimeApprovalState;
  governanceState: FounderRuntimeGovernanceState;
  runtimeState: FounderRuntimeState;
  evidenceStatus: FounderEvidenceStatus;
  ledgerStatus: FounderLedgerStatus;
  blockerReason: string | null;
  requiredNextAction: string | null;
  updatedAt: string;
}

export interface FounderRuntimeConversionInput {
  requestId?: string | null;
  correlationId?: string | null;
  founderId?: string | null;
  source?: FounderRuntimeSource | string | null;
  intent?: string | null;
  requestedAction?: string | null;
  targetAgent?: string | null;
  capabilityId?: string | null;
  payload?: Record<string, unknown> | null;
  approvalRequirement?: FounderRuntimeApprovalRequirement | boolean | null;
  submittedAt?: string | null;
}

function asNonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSource(source: FounderRuntimeConversionInput["source"]): FounderRuntimeSource {
  if (source === "harmony_operator" || source === "approval_center" || source === "approval_resume" || source === "founder_reporting") {
    return source;
  }
  return "unknown";
}

function normalizeApprovalRequirement(
  requirement: FounderRuntimeConversionInput["approvalRequirement"],
): FounderRuntimeApprovalRequirement {
  if (requirement === "required" || requirement === true) return "required";
  return "not_required";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function toFounderOperationalRequest(input: FounderRuntimeConversionInput): FounderOperationalRequest {
  return {
    requestId: asNonEmpty(input.requestId) ?? "",
    correlationId: asNonEmpty(input.correlationId) ?? "",
    founderId: asNonEmpty(input.founderId) ?? "",
    source: normalizeSource(input.source),
    intent: asNonEmpty(input.intent) ?? "unknown_intent",
    requestedAction: asNonEmpty(input.requestedAction) ?? "unknown_action",
    targetAgent: asNonEmpty(input.targetAgent) ?? "unknown_agent",
    capabilityId: asNonEmpty(input.capabilityId) ?? "",
    payload: input.payload ?? {},
    approvalRequirement: normalizeApprovalRequirement(input.approvalRequirement),
    submittedAt: asNonEmpty(input.submittedAt) ?? nowIso(),
  };
}

export function validateFounderOperationalRequest(request: FounderOperationalRequest):
  | { ok: true }
  | { ok: false; error: "missing_request_id" | "missing_founder_id" | "missing_capability_id" | "missing_correlation_id" } {
  if (!asNonEmpty(request.requestId)) return { ok: false, error: "missing_request_id" };
  if (!asNonEmpty(request.correlationId)) return { ok: false, error: "missing_correlation_id" };
  if (!asNonEmpty(request.founderId)) return { ok: false, error: "missing_founder_id" };
  if (!asNonEmpty(request.capabilityId)) return { ok: false, error: "missing_capability_id" };
  return { ok: true };
}

export function createFounderRuntimeStatusEnvelope(input: {
  executionId: string;
  requestId: string;
  correlationId: string;
  state: FounderRuntimeExecutionState;
  approvalState: FounderRuntimeApprovalState;
  governanceState: FounderRuntimeGovernanceState;
  runtimeState: FounderRuntimeState;
  evidenceStatus: FounderEvidenceStatus;
  ledgerStatus: FounderLedgerStatus;
  blockerReason?: string | null;
  requiredNextAction?: string | null;
  updatedAt?: string;
}): FounderRuntimeStatusEnvelope {
  return {
    executionId: input.executionId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    state: input.state,
    approvalState: input.approvalState,
    governanceState: input.governanceState,
    runtimeState: input.runtimeState,
    evidenceStatus: input.evidenceStatus,
    ledgerStatus: input.ledgerStatus,
    blockerReason: input.blockerReason ?? null,
    requiredNextAction: input.requiredNextAction ?? null,
    updatedAt: asNonEmpty(input.updatedAt) ?? nowIso(),
  };
}
