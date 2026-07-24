import "server-only";

import { createClient } from "@/lib/supabase/server";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  readCanonicalWorkforceEnvelope,
  respondToTask,
  transitionCanonicalWorkforceEnvelope,
  type AgentMessage,
  type CanonicalWorkforceEnvelope,
} from "@/lib/harmony/agents/a2a";
import { resumeApprovedExecution } from "@/lib/harmony/autonomy/execution-resumption";
import { certifyWorkforceAgent } from "@/lib/workforce/certification";
import { getAiosAgent, isFounderOnlyAgent, type AiosAgentKey } from "@/lib/workforce/registry";
import { handleMasonEngineeringMessage } from "@/lib/workforce/mason-action";
import { runConnectorCapability } from "@/lib/integrations/connector-runtime";
import type { EventDelivery, EventMeshConsumer } from "@/lib/event-mesh/types";
import type { AiosAgent } from "@/lib/workforce/registry";

const SUPPORTED_WORKERS: ReadonlySet<AiosAgentKey> = new Set([
  "harmony",
  "auditor",
  "mason",
  "catalyst",
  "ambassador",
  "atlas",
  "pulse",
  "horizon",
  "aegis",
  "ledger",
]);

const ALWAYS_UNSUPPORTED: ReadonlySet<AiosAgentKey> = new Set([
  "auditor",
  "atlas",
  "pulse",
  "horizon",
  "aegis",
  "ledger",
]);

type DispatchOutcome = {
  kind: "completed" | "awaiting_approval" | "blocked" | "failed" | "escalated" | "unsupported_runtime" | "invalid_payload";
  summary: string;
  policyOutcome: "allowed" | "approval_required" | "denied" | "unsupported";
};

async function loadAgentMessage(userId: string, messageId: string): Promise<AgentMessage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) {
    console.error("[event-mesh/workforce] load message", error.message);
    return null;
  }
  return (data as AgentMessage | null) ?? null;
}

async function saveEnvelopeState(
  userId: string,
  messageId: string,
  message: AgentMessage,
  next: CanonicalWorkforceEnvelope["execution"]["status"],
  opts?: { reason?: string | null; approvalId?: string | null },
): Promise<void> {
  const current = readCanonicalWorkforceEnvelope(message);
  if (!current) return;
  const envelope = transitionCanonicalWorkforceEnvelope(current, next, {
    reason: opts?.reason,
    approvalId: opts?.approvalId,
  });
  const context = {
    ...(message.context ?? {}),
    envelope,
    correlationId: envelope.trace.correlationId,
  };
  const supabase = await createClient();
  await supabase
    .from("agent_messages")
    .update({ context })
    .eq("user_id", userId)
    .eq("id", messageId);
}

async function markMessageStatus(userId: string, messageId: string, status: AgentMessage["status"], outcome?: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .update({ status, ...(outcome ? { outcome: outcome.slice(0, 8000) } : {}) })
    .eq("user_id", userId)
    .eq("id", messageId)
    .in("status", ["delegated", "in_progress", "awaiting_approval"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[event-mesh/workforce] mark message", error.message);
    return false;
  }
  return Boolean(data);
}

function eventMeshExecutionEnabled(): boolean {
  return process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION === "true";
}

function hasRegisteredRuntime(agent: AiosAgent): boolean {
  return getAiosAgent(agent.key) !== null;
}

function extractExecutionId(event: EventDelivery["event"]): string | null {
  const executionId = typeof event.context?.executionId === "string" ? event.context.executionId.trim() : "";
  return executionId ? executionId : null;
}

function traceTail(event: EventDelivery["event"], executionId: string): string {
  return `company=${event.companyId ?? "none"} execution=${executionId} correlation=${event.correlationId} causation=${event.causationId ?? "none"}`;
}

function validateRecipient(event: EventDelivery["event"], message: AgentMessage): string | null {
  const eventRecipient = event.targetAgent;
  if (!eventRecipient) return "missing_recipient";
  if (!SUPPORTED_WORKERS.has(eventRecipient as AiosAgentKey)) return "unknown_recipient";
  if (eventRecipient !== message.to_agent) return "wrong_recipient";
  return null;
}

function parseJsonBody(body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractAmbassadorMessagePayload(message: AgentMessage): { conversationId: string; body: string } | null {
  const context = (message.context ?? {}) as Record<string, unknown>;
  const conversationId = typeof context.conversationId === "string" ? context.conversationId : null;
  const outgoingBody = typeof context.outgoingBody === "string" ? context.outgoingBody : null;
  if (conversationId && outgoingBody) return { conversationId, body: outgoingBody };

  const payload = parseJsonBody(message.body);
  if (!payload) return null;
  const cid = typeof payload.conversationId === "string" ? payload.conversationId : null;
  const body = typeof payload.body === "string" ? payload.body : null;
  if (!cid || !body) return null;
  return { conversationId: cid, body };
}

function extractHarmonyWorkItemPayload(message: AgentMessage): { workItemId: string } | null {
  const context = (message.context ?? {}) as Record<string, unknown>;
  const workItemId = typeof context.workItemId === "string" ? context.workItemId : null;
  if (workItemId) return { workItemId };
  const payload = parseJsonBody(message.body);
  if (!payload) return null;
  const wid = typeof payload.workItemId === "string" ? payload.workItemId : null;
  return wid ? { workItemId: wid } : null;
}

function extractCatalystConnectorMapping(message: AgentMessage): {
  connectorId: string;
  capabilityId: string;
  params: Record<string, unknown>;
} | null {
  const context = (message.context ?? {}) as Record<string, unknown>;
  const connectorId = typeof context.connectorId === "string" ? context.connectorId : null;
  const capabilityId = typeof context.capabilityId === "string" ? context.capabilityId : null;
  const params = context.connectorParams && typeof context.connectorParams === "object" && !Array.isArray(context.connectorParams)
    ? (context.connectorParams as Record<string, unknown>)
    : {};
  if (connectorId && capabilityId) return { connectorId, capabilityId, params };

  const payload = parseJsonBody(message.body);
  if (!payload) return null;
  const c = typeof payload.connectorId === "string" ? payload.connectorId : null;
  const cap = typeof payload.capabilityId === "string" ? payload.capabilityId : null;
  const p = payload.params && typeof payload.params === "object" && !Array.isArray(payload.params)
    ? (payload.params as Record<string, unknown>)
    : {};
  if (!c || !cap) return null;
  return { connectorId: c, capabilityId: cap, params: p };
}

async function loadHarmonyWorkItem(userId: string, companyId: string, workItemId: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("id", workItemId)
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("[event-mesh/workforce] load work item", error.message);
    return null;
  }
  return (data as Record<string, unknown> | null) ?? null;
}

async function dispatchToWorkerRuntime(message: AgentMessage, event: EventDelivery["event"], executionId: string): Promise<DispatchOutcome> {
  if (ALWAYS_UNSUPPORTED.has(message.to_agent as AiosAgentKey)) {
    return {
      kind: "unsupported_runtime",
      summary: `unsupported_runtime:${message.to_agent}:${traceTail(event, executionId)}`,
      policyOutcome: "unsupported",
    };
  }

  if (message.to_agent === "mason") {
    try {
      const result = await handleMasonEngineeringMessage({
        userId: message.user_id,
        companyId: message.company_id,
        message: `${message.subject}\n\n${message.body ?? ""}`.trim(),
        requesterAuthorization: {
          role: "system",
          verified: true,
          source: "trusted_runtime",
        },
        correlationId: event.correlationId,
        causationId: event.causationId ?? event.eventId,
      });
      if (result.status === "completed") {
        return {
          kind: "completed",
          summary: `${result.summary} | ${traceTail(event, executionId)}`,
          policyOutcome: "allowed",
        };
      }
      return {
        kind: "failed",
        summary: `${result.summary} | ${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    } catch (error) {
      return {
        kind: "failed",
        summary: `${error instanceof Error ? error.message : "mason_runtime_failed"} | ${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    }
  }

  if (message.to_agent === "ambassador") {
    const payload = extractAmbassadorMessagePayload(message);
    if (!payload) {
      return {
        kind: "invalid_payload",
        summary: `ambassador_invalid_payload:${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    }
    return {
      kind: "escalated",
      summary: `ambassador_dispatch_ready:conversation=${payload.conversationId}:${traceTail(event, executionId)}`,
      policyOutcome: "approval_required",
    };
  }

  if (message.to_agent === "harmony") {
    const payload = extractHarmonyWorkItemPayload(message);
    if (!payload) {
      return {
        kind: "invalid_payload",
        summary: `harmony_invalid_payload:${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    }
    const item = await loadHarmonyWorkItem(message.user_id, message.company_id, payload.workItemId);
    if (!item) {
      return {
        kind: "invalid_payload",
        summary: `harmony_missing_work_item:${payload.workItemId}:${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    }
    return {
      kind: "escalated",
      summary: `harmony_work_item_routing:${payload.workItemId}:${traceTail(event, executionId)}`,
      policyOutcome: "allowed",
    };
  }

  if (message.to_agent === "catalyst") {
    const mapping = extractCatalystConnectorMapping(message);
    if (!mapping) {
      return {
        kind: "unsupported_runtime",
        summary: `unsupported_runtime:catalyst:no_explicit_connector_mapping:${traceTail(event, executionId)}`,
        policyOutcome: "unsupported",
      };
    }

    const connector = await runConnectorCapability(
      message.user_id,
      mapping.connectorId,
      mapping.capabilityId,
      mapping.params,
      { companyId: message.company_id },
    );

    if (connector.status === "pending") {
      return {
        kind: "awaiting_approval",
        summary: `catalyst_approval_pending:${connector.message}:${traceTail(event, executionId)}`,
        policyOutcome: "approval_required",
      };
    }
    if (connector.ok && connector.status === "executed") {
      return {
        kind: "completed",
        summary: `catalyst_completed:${connector.message}:${traceTail(event, executionId)}`,
        policyOutcome: "allowed",
      };
    }
    if (connector.status === "blocked") {
      return {
        kind: "blocked",
        summary: `catalyst_blocked:${connector.message}:${traceTail(event, executionId)}`,
        policyOutcome: "denied",
      };
    }
    return {
      kind: "failed",
      summary: `catalyst_failed:${connector.message}:${traceTail(event, executionId)}`,
      policyOutcome: "denied",
    };
  }

  return {
    kind: "unsupported_runtime",
    summary: `unsupported_runtime:${message.to_agent}:${traceTail(event, executionId)}`,
    policyOutcome: "unsupported",
  };
}

export async function handleWorkforceTaskCreated(delivery: EventDelivery): Promise<void> {
  const { event } = delivery;
  const userId = event.userId;
  const messageId = event.taskRef?.type === "agent_message" ? event.taskRef.id : null;
  if (!userId || !event.companyId || !messageId) {
    await delivery.deadLetter("workforce_task_missing_reference");
    return;
  }

  const message = await loadAgentMessage(userId, messageId);
  if (!message) {
    await delivery.deadLetter("agent_message_not_found");
    return;
  }

  const recipientError = validateRecipient(event, message);
  if (recipientError) {
    await saveEnvelopeState(userId, messageId, message, "dead_lettered", { reason: recipientError });
    await delivery.deadLetter(recipientError);
    return;
  }

  if (message.company_id !== event.companyId) {
    await saveEnvelopeState(userId, messageId, message, "dead_lettered", { reason: "company_scope_mismatch" });
    await delivery.deadLetter("company_scope_mismatch");
    return;
  }

  const executionId = extractExecutionId(event);
  if (!executionId) {
    await saveEnvelopeState(userId, messageId, message, "dead_lettered", { reason: "missing_execution_context" });
    await delivery.deadLetter("missing_execution_context");
    return;
  }

  if (!event.correlationId || !event.traceId) {
    await saveEnvelopeState(userId, messageId, message, "dead_lettered", { reason: "missing_correlation_context" });
    await delivery.deadLetter("missing_correlation_context");
    return;
  }

  if (message.status === "awaiting_approval") {
    await saveEnvelopeState(userId, messageId, message, "awaiting_approval", {
      approvalId: event.approvalId,
      reason: "approval_pending",
    });
    await delivery.acknowledge();
    return;
  }

  if (message.status === "completed" || message.status === "blocked") {
    await delivery.acknowledge();
    return;
  }

  const target = getAiosAgent(message.to_agent);
  if (!target) {
    await markMessageStatus(userId, messageId, "blocked", "Unknown target agent rejected by Event Mesh.");
    await saveEnvelopeState(userId, messageId, message, "dead_lettered", { reason: "unknown_target_agent" });
    await delivery.acknowledge();
    return;
  }

  if (isFounderOnlyAgent(target.key) && event.actor.type !== "founder") {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: target.key,
      status: "blocked",
      outcome: "Founder-only agent work cannot run from a non-Founder event.",
    });
    await saveEnvelopeState(userId, messageId, message, "blocked", { reason: "founder_only_policy_denied" });
    await delivery.acknowledge();
    return;
  }

  const certification = await certifyWorkforceAgent(target, { userId });
  const hardBlocker = certification.dependencyReadiness.some((dep) => dep.required && dep.blockers.length > 0);
  if (hardBlocker || certification.status === "blocked" || !hasRegisteredRuntime(target)) {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: target.key,
      status: "blocked",
      outcome: `Event Mesh blocked ${target.name}: ${certification.blockers[0] ?? "runtime is not ready."}`,
    });
    await saveEnvelopeState(userId, messageId, message, "blocked", {
      reason: certification.blockers[0] ?? "runtime_not_ready",
    });
    await delivery.acknowledge();
    return;
  }

  await saveEnvelopeState(userId, messageId, message, "acknowledged", { approvalId: event.approvalId });
  await delivery.acknowledge();

  if (!eventMeshExecutionEnabled()) {
    const claimed = await markMessageStatus(userId, messageId, "in_progress");
    if (claimed) {
      await saveEnvelopeState(userId, messageId, message, "in_progress");
      await emitActivity({
        userId,
        companyId: event.companyId,
        actorType: "agent",
        kind: "agent_action",
        summary: `Event Mesh delivered ${message.subject} to ${target.name}; asynchronous execution is in shadow mode.`,
        refType: "agent_message",
        refId: message.id,
      });
    }
    return;
  }

  const outcome = await dispatchToWorkerRuntime(message, event, executionId);

  if (outcome.kind === "completed") {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: target.key,
      status: "completed",
      outcome: outcome.summary.slice(0, 8000),
    });
    await saveEnvelopeState(userId, messageId, message, "completed");
    return;
  }

  if (outcome.kind === "awaiting_approval") {
    await markMessageStatus(userId, message.id, "awaiting_approval", outcome.summary);
    await saveEnvelopeState(userId, messageId, message, "awaiting_approval", {
      approvalId: event.approvalId,
      reason: "approval_pending",
    });
    return;
  }

  if (outcome.kind === "escalated") {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: "harmony",
      status: "blocked",
      outcome: outcome.summary.slice(0, 8000),
    });
    await saveEnvelopeState(userId, messageId, message, "blocked", { reason: "escalated" });
    return;
  }

  const blockedReason = outcome.kind === "unsupported_runtime"
    ? "unsupported_runtime"
    : outcome.kind === "invalid_payload"
      ? "invalid_payload"
      : outcome.kind === "blocked"
        ? "blocked"
        : "failed";

  await respondToTask({
    userId,
    companyId: event.companyId,
    parentId: message.id,
    fromAgent: target.key,
    status: "blocked",
    outcome: `${outcome.summary} | policy=${outcome.policyOutcome}`.slice(0, 8000),
  });
  await saveEnvelopeState(userId, messageId, message, "blocked", { reason: blockedReason });
}

export async function handleApprovalResolved(delivery: EventDelivery): Promise<void> {
  const { event } = delivery;
  if (!event.userId || !event.approvalId) {
    await delivery.deadLetter("approval_event_missing_reference");
    return;
  }
  if (event.payload.status === "rejected" || event.payload.resumed === true) {
    await delivery.acknowledge();
    return;
  }
  const outcome = await resumeApprovedExecution(event.userId, event.approvalId, event.companyId);
  if (!outcome.ok) {
    await delivery.negativeAcknowledge(outcome.error ?? "approval_resume_failed", { retry: true, delayMs: 5000 });
    return;
  }
  await delivery.acknowledge();
}

export function createWorkforceEventConsumer(): EventMeshConsumer {
  return {
    consumerName: process.env.AIOS_EVENT_MESH_WORKFORCE_CONSUMER ?? "aios-workforce-dispatcher",
    eventTypes: ["workforce.task.created", "approval.resolved"],
    concurrency: Number(process.env.AIOS_EVENT_MESH_WORKFORCE_CONCURRENCY ?? 2),
    retryPolicy: { maximumAttempts: 5, initialDelayMs: 1000, backoffMultiplier: 2, maximumDelayMs: 30000 },
    handler: async (delivery) => {
      if (delivery.event.eventType === "workforce.task.created") return handleWorkforceTaskCreated(delivery);
      if (delivery.event.eventType === "approval.resolved") return handleApprovalResolved(delivery);
      await delivery.acknowledge();
    },
  };
}
