import "server-only";

import { recordOpsEvent } from "@/lib/observability/ops";

export type MasonChatDiagnosticPhase =
  | "mason_chat_server_entered"
  | "mason_chat_agent_resolved"
  | "mason_chat_company_resolved"
  | "mason_chat_readonly_guard_evaluated"
  | "mason_chat_intent_classified"
  | "mason_chat_path_selected"
  | "mason_chat_engineering_handler_called"
  | "mason_chat_runtime_called"
  | "mason_chat_approval_result_received"
  | "mason_chat_response_returned"
  | "mason_chat_failed";

export interface MasonChatDiagnosticContext {
  correlationId: string;
  userId?: string | null;
  companyId?: string | null;
  conversationId?: string | null;
  executionId?: string | null;
  agentKey?: string | null;
  intentCategory?: string | null;
  readonlyGuardResult?: boolean | null;
  selectedPath?: string | null;
  approvalId?: string | null;
  functionName?: string | null;
}

const REDACTED_KEYS = [
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "password",
  "secret",
  "api_key",
  "key",
  "credential",
  "headers",
  "message",
  "body",
  "content",
];

function sanitizeError(error: unknown): {
  name: string;
  message: string;
  stack: string | null;
  digest: string | null;
} {
  if (error instanceof Error) {
    const withDigest = error as Error & { digest?: string };
    return {
      name: error.name || "Error",
      message: error.message || "unknown_error",
      stack: error.stack ?? null,
      digest: typeof withDigest.digest === "string" ? withDigest.digest : null,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "unknown_error",
    stack: null,
    digest: null,
  };
}

function safeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => safeValue(item));
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      if (REDACTED_KEYS.some((blocked) => key.toLowerCase().includes(blocked))) {
        output[key] = "[redacted]";
      } else {
        output[key] = safeValue(entry);
      }
    }
    return output;
  }
  return String(value);
}

export async function logMasonChatPhase(
  phase: MasonChatDiagnosticPhase,
  context: MasonChatDiagnosticContext,
  extras?: Record<string, unknown>,
): Promise<void> {
  if (!context.userId) return;

  await recordOpsEvent({
    userId: context.userId,
    companyId: context.companyId ?? null,
    level: phase === "mason_chat_failed" ? "error" : "info",
    source: "workforce.mason-chat",
    message: phase,
    context: {
      correlationId: context.correlationId,
      userId: context.userId,
      companyId: context.companyId ?? null,
      conversationId: context.conversationId ?? null,
      executionId: context.executionId ?? null,
      agentKey: context.agentKey ?? null,
      intentCategory: context.intentCategory ?? null,
      readonlyGuardResult: context.readonlyGuardResult ?? null,
      selectedPath: context.selectedPath ?? null,
      approvalId: context.approvalId ?? null,
      functionName: context.functionName ?? null,
      phase,
      timestamp: new Date().toISOString(),
      ...(extras ? (safeValue(extras) as Record<string, unknown>) : {}),
    },
  });
}

export async function logMasonChatFailure(
  phase: MasonChatDiagnosticPhase,
  context: MasonChatDiagnosticContext,
  error: unknown,
): Promise<void> {
  const normalized = sanitizeError(error);

  await logMasonChatPhase("mason_chat_failed", context, {
    failedPhase: phase,
    errorName: normalized.name,
    errorMessage: normalized.message,
    stackTrace: normalized.stack,
    digest: normalized.digest,
  });
}

export function createMasonChatCorrelationId(): string {
  return `mason-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
