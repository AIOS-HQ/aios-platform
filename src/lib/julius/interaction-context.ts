import { AIOS_WORKFORCE, type AiosAgentKey } from "@/lib/workforce/registry";

const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[_-]?key|authorization|refresh|private[_-]?key|signed[_-]?url)/i;
const PLACEHOLDER_PATTERN = /^(unknown|none|null|n\/a|placeholder|todo|temp)$/i;

export type JuliusSourceType =
  | "event_mesh"
  | "mason_runtime"
  | "harmony_execution"
  | "approval"
  | "work_item"
  | "agent_message";

export interface JuliusInteractionContext {
  company_id: string;
  user_id?: string | null;
  actor_id?: string | null;
  execution_id: string;
  correlation_id: string;
  causation_id?: string | null;
  worker_id: AiosAgentKey;
  workspace_id?: string | null;
  objective_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  harmony_session_id?: string | null;
  source_type: JuliusSourceType;
  source_id: string;
  approval_id?: string | null;
  timestamp: string;
  trace: Record<string, unknown>;
}

function hasSecretLikeKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasSecretLikeKeys(item));
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    if (SECRET_KEY_PATTERN.test(key)) return true;
    return hasSecretLikeKeys(nested);
  });
}

function isSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function requireId(value: string | null | undefined, field: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error(`${field}_required`);
  if (PLACEHOLDER_PATTERN.test(v)) throw new Error(`${field}_placeholder`);
  return v;
}

export function isValidWorkerId(workerId: string): workerId is AiosAgentKey {
  return AIOS_WORKFORCE.some((agent) => agent.key === workerId);
}

export function createJuliusInteractionContext(input: Omit<JuliusInteractionContext, "timestamp"> & { timestamp?: string }): JuliusInteractionContext {
  const companyId = requireId(input.company_id, "company_id");
  const executionId = requireId(input.execution_id, "execution_id");
  const correlationId = requireId(input.correlation_id, "correlation_id");
  const sourceId = requireId(input.source_id, "source_id");

  if (!isValidWorkerId(input.worker_id)) {
    throw new Error("invalid_worker_id");
  }

  const actor = (input.actor_id ?? "").trim();
  const user = (input.user_id ?? "").trim();
  if (!actor && !user) throw new Error("actor_or_user_required");

  if (hasSecretLikeKeys(input.trace)) {
    throw new Error("secret_like_metadata_rejected");
  }

  if (!isSerializable(input.trace)) {
    throw new Error("trace_not_serializable");
  }

  const timestamp = input.timestamp ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("timestamp_invalid");
  }

  return {
    ...input,
    company_id: companyId,
    execution_id: executionId,
    correlation_id: correlationId,
    source_id: sourceId,
    timestamp,
  };
}

export function assertCompanyScope(context: JuliusInteractionContext, companyId: string): void {
  if (context.company_id !== companyId) {
    throw new Error("cross_company_access_denied");
  }
}
