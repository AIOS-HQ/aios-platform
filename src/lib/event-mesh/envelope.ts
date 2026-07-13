import { createHash, randomUUID } from "node:crypto";
import type { AiosEventEnvelope, AiosEventType, EventPriority, EventRisk } from "@/lib/event-mesh/types";

export const AIOS_EVENT_VERSION = 1 as const;
export const AIOS_EVENT_CONTENT_TYPE = "application/vnd.aios.event+json" as const;
export const AIOS_EVENT_MAX_BYTES = 64 * 1024;

const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[_-]?key|authorization|refresh|private[_-]?key|signed[_-]?url)/i;
const ALLOWED_PRIORITIES = new Set<EventPriority>(["low", "normal", "high", "critical"]);
const ALLOWED_RISKS = new Set<EventRisk>(["routine", "approval", "destructive"]);
const EVENT_TYPES = new Set<AiosEventType>([
  "workforce.task.created",
  "workforce.task.approved",
  "workforce.task.rejected",
  "workforce.task.started",
  "workforce.task.completed",
  "workforce.task.blocked",
  "workforce.message.sent",
  "workforce.response.created",
  "connector.execution.requested",
  "connector.execution.completed",
  "connector.execution.blocked",
  "approval.requested",
  "approval.resolved",
  "skill.learned",
  "julius.memory.recorded",
  "system.health.changed",
  "social.publish.requested",
  "social.publish.completed",
  "social.publish.failed",
]);

export class EventEnvelopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventEnvelopeValidationError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicIdempotencyKey(input: {
  eventType: AiosEventType;
  companyId?: string | null;
  userId?: string | null;
  sourceAgent?: string | null;
  targetAgent?: string | null;
  taskRef?: { type: string; id: string } | null;
  payload?: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(stableJson({
      eventType: input.eventType,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      sourceAgent: input.sourceAgent ?? null,
      targetAgent: input.targetAgent ?? null,
      taskRef: input.taskRef ?? null,
      payload: input.payload ?? {},
    }))
    .digest("hex");
}

function assertIso(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new EventEnvelopeValidationError(`${field} must be an ISO timestamp.`);
  }
}

function assertNoSecretKeys(value: unknown, path = "event"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretKeys(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new EventEnvelopeValidationError(`Unsafe secret-bearing key rejected at ${path}.${key}.`);
    }
    assertNoSecretKeys(nested, `${path}.${key}`);
  }
}

export function validateAiosEventEnvelope(input: unknown): AiosEventEnvelope {
  if (!input || typeof input !== "object") {
    throw new EventEnvelopeValidationError("Event envelope must be an object.");
  }
  const event = input as AiosEventEnvelope;
  if (!event.eventId) throw new EventEnvelopeValidationError("eventId is required.");
  if (!EVENT_TYPES.has(event.eventType)) throw new EventEnvelopeValidationError(`Unsupported event type: ${String(event.eventType)}.`);
  if (event.eventVersion !== AIOS_EVENT_VERSION) throw new EventEnvelopeValidationError(`Unsupported event version: ${String(event.eventVersion)}.`);
  if (event.contentType !== AIOS_EVENT_CONTENT_TYPE) throw new EventEnvelopeValidationError("Unsupported event content type.");
  assertIso(event.occurredAt, "occurredAt");
  assertIso(event.publishedAt, "publishedAt");
  if (event.scheduledFor) assertIso(event.scheduledFor, "scheduledFor");
  if (!event.companyId && event.eventType.startsWith("workforce.")) {
    throw new EventEnvelopeValidationError("companyId is required for workforce events.");
  }
  if (!event.actor?.type || !event.actor.id) throw new EventEnvelopeValidationError("actor identity is required.");
  if (!ALLOWED_RISKS.has(event.risk)) throw new EventEnvelopeValidationError("risk is invalid.");
  if (!ALLOWED_PRIORITIES.has(event.priority)) throw new EventEnvelopeValidationError("priority is invalid.");
  if (!event.traceId || !event.correlationId || !event.idempotencyKey) {
    throw new EventEnvelopeValidationError("traceId, correlationId, and idempotencyKey are required.");
  }
  if (event.attempt < 0 || event.maximumAttempts < 1 || event.attempt > event.maximumAttempts) {
    throw new EventEnvelopeValidationError("attempt bounds are invalid.");
  }
  assertNoSecretKeys(event.payload, "payload");
  assertNoSecretKeys(event.context, "context");
  const bytes = Buffer.byteLength(JSON.stringify(event), "utf8");
  if (bytes > AIOS_EVENT_MAX_BYTES) {
    throw new EventEnvelopeValidationError(`Event envelope exceeds ${AIOS_EVENT_MAX_BYTES} bytes.`);
  }
  return event;
}

export function createAiosEventEnvelope(input: {
  eventType: AiosEventType;
  companyId?: string | null;
  userId?: string | null;
  actor?: AiosEventEnvelope["actor"];
  sourceAgent?: string | null;
  targetAgent?: string | null;
  audience?: string[];
  taskRef?: AiosEventEnvelope["taskRef"];
  objectiveId?: string | null;
  approvalId?: string | null;
  risk?: EventRisk;
  category?: string | null;
  priority?: EventPriority;
  traceId?: string;
  correlationId?: string;
  causationId?: string | null;
  idempotencyKey?: string;
  attempt?: number;
  maximumAttempts?: number;
  scheduledFor?: string | null;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  attachmentRefs?: AiosEventEnvelope["attachmentRefs"];
  occurredAt?: string;
  publishedAt?: string;
}): AiosEventEnvelope {
  const now = new Date().toISOString();
  const event: AiosEventEnvelope = {
    eventId: randomUUID(),
    eventType: input.eventType,
    eventVersion: AIOS_EVENT_VERSION,
    occurredAt: input.occurredAt ?? now,
    publishedAt: input.publishedAt ?? now,
    companyId: input.companyId ?? null,
    userId: input.userId ?? null,
    actor: input.actor ?? { type: input.sourceAgent ? "agent" : "system", id: input.sourceAgent ?? "aios" },
    sourceAgent: input.sourceAgent ?? null,
    targetAgent: input.targetAgent ?? null,
    audience: input.audience ?? [],
    taskRef: input.taskRef ?? null,
    objectiveId: input.objectiveId ?? null,
    approvalId: input.approvalId ?? null,
    risk: input.risk ?? "routine",
    category: input.category ?? null,
    priority: input.priority ?? "normal",
    traceId: input.traceId ?? randomUUID(),
    correlationId: input.correlationId ?? input.traceId ?? randomUUID(),
    causationId: input.causationId ?? null,
    idempotencyKey: input.idempotencyKey ?? deterministicIdempotencyKey(input),
    attempt: input.attempt ?? 0,
    maximumAttempts: input.maximumAttempts ?? 5,
    scheduledFor: input.scheduledFor ?? null,
    payload: input.payload ?? {},
    context: input.context ?? {},
    attachmentRefs: input.attachmentRefs ?? [],
    contentType: AIOS_EVENT_CONTENT_TYPE,
  };
  return validateAiosEventEnvelope(event);
}

export function safeEventMetadata(event: AiosEventEnvelope): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    companyId: event.companyId,
    userId: event.userId,
    sourceAgent: event.sourceAgent,
    targetAgent: event.targetAgent,
    taskRef: event.taskRef,
    approvalId: event.approvalId,
    risk: event.risk,
    priority: event.priority,
    traceId: event.traceId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    idempotencyKey: event.idempotencyKey,
    scheduledFor: event.scheduledFor,
  };
}
