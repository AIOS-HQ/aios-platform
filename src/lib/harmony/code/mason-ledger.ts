import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MasonExecutionLedgerEventType =
  | "intake_received"
  | "policy_evaluated"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "execution_started"
  | "connector_operation_started"
  | "connector_operation_completed"
  | "connector_operation_failed"
  | "validation_started"
  | "validation_completed"
  | "rollback_started"
  | "rollback_completed"
  | "rollback_failed"
  | "reporting_started"
  | "reporting_completed"
  | "execution_completed"
  | "execution_failed"
  | "execution_cancelled";

export interface MasonExecutionLedgerEvent {
  id: string;
  execution_id: string;
  user_id: string;
  company_id: string;
  agent: "mason";
  event_type: MasonExecutionLedgerEventType;
  runtime_state: string | null;
  operation_type: string | null;
  connector_id: string | null;
  target_resource: string | null;
  approval_id: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  preview_url: string | null;
  validation_ref: string | null;
  rollback_ref: string | null;
  result_status: "ok" | "blocked" | "failed" | "cancelled" | "partial";
  failure_classification: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  idempotency_key: string;
  created_at: string;
}

export interface AppendMasonLedgerEventInput {
  executionId: string;
  userId: string;
  companyId: string;
  eventType: MasonExecutionLedgerEventType;
  runtimeState?: string | null;
  operationType?: string | null;
  connectorId?: string | null;
  targetResource?: string | null;
  approvalId?: string | null;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  previewUrl?: string | null;
  validationRef?: string | null;
  rollbackRef?: string | null;
  resultStatus: MasonExecutionLedgerEvent["result_status"];
  failureClassification?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}

const SAFE_METADATA_ALLOWLIST = new Set([
  "state",
  "correlationId",
  "taskVersion",
  "currentState",
  "completedStates",
  "validationAttempts",
  "ciAttempts",
  "ciPollAttempts",
  "ciExpectedHeadSha",
  "updatedAt",
  "validationLifecycle",
  "safeEvidenceRefs",
  "failure",
  "evidenceRef",
  "repository",
  "prNumber",
  "branch",
  "expectedHeadSha",
  "observedHeadSha",
  "requiredValidationIds",
  "observedCheckClassifications",
  "validationState",
  "terminalStatus",
  "evidenceTimestamp",
  "executionId",
  "failedWithoutRemediation",
]);

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata) return {};
  const redacted = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
  const banned = [/token/i, /secret/i, /password/i, /key$/i, /authorization/i, /cookie/i];

  const walk = (obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      if (banned.some((pattern) => pattern.test(key))) {
        obj[key] = "[REDACTED]";
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Record<string, unknown>);
      }
    }
  };
  walk(redacted);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (!SAFE_METADATA_ALLOWLIST.has(key)) continue;
    safe[key] = value;
  }
  return safe;
}

export function createMasonExecutionId(input: {
  userId: string;
  companyId: string;
  repository: string;
  objective: string;
  branch?: string | null;
}): string {
  const branch = input.branch?.trim() || "no-branch";
  const objective = input.objective.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48) || "objective";
  return [
    "mason",
    input.userId.slice(0, 8),
    input.companyId.slice(0, 16),
    input.repository.toLowerCase().replace(/[^a-z0-9/._-]+/g, "-").slice(0, 64),
    branch.toLowerCase().replace(/[^a-z0-9/._-]+/g, "-").slice(0, 64),
    objective,
  ].join(":");
}

export async function appendMasonLedgerEvent(
  input: AppendMasonLedgerEventInput,
): Promise<MasonExecutionLedgerEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mason_execution_events")
    .insert({
      execution_id: input.executionId,
      user_id: input.userId,
      company_id: input.companyId,
      event_type: input.eventType,
      runtime_state: input.runtimeState ?? null,
      operation_type: input.operationType ?? null,
      connector_id: input.connectorId ?? null,
      target_resource: input.targetResource ?? null,
      approval_id: input.approvalId ?? null,
      pull_request_number: input.pullRequestNumber ?? null,
      pull_request_url: input.pullRequestUrl ?? null,
      preview_url: input.previewUrl ?? null,
      validation_ref: input.validationRef ?? null,
      rollback_ref: input.rollbackRef ?? null,
      result_status: input.resultStatus,
      failure_classification: input.failureClassification ?? null,
      summary: input.summary,
      metadata: sanitizeMetadata(input.metadata),
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const existing = await supabase
        .from("mason_execution_events")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      return (existing.data as MasonExecutionLedgerEvent | null) ?? null;
    }
    console.error("[mason-ledger] append", error.message);
    return null;
  }

  return (data as MasonExecutionLedgerEvent | null) ?? null;
}

export async function listMasonExecutionTimeline(input: {
  userId: string;
  companyId: string;
  executionId: string;
}): Promise<MasonExecutionLedgerEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mason_execution_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("execution_id", input.executionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[mason-ledger] list timeline", error.message);
    return [];
  }
  return (data as MasonExecutionLedgerEvent[] | null) ?? [];
}

export async function getMasonLatestExecutionState(input: {
  userId: string;
  companyId: string;
  executionId: string;
}): Promise<MasonExecutionLedgerEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mason_execution_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("execution_id", input.executionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[mason-ledger] latest", error.message);
    return null;
  }
  return (data as MasonExecutionLedgerEvent | null) ?? null;
}

export async function listMasonCompanyHistory(input: {
  userId: string;
  companyId: string;
  limit?: number;
}): Promise<MasonExecutionLedgerEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mason_execution_events")
    .select("*")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 200);

  if (error) {
    console.error("[mason-ledger] company history", error.message);
    return [];
  }
  return (data as MasonExecutionLedgerEvent[] | null) ?? [];
}
