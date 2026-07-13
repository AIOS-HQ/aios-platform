export type AiosEventType =
  | "workforce.task.created"
  | "workforce.task.approved"
  | "workforce.task.rejected"
  | "workforce.task.started"
  | "workforce.task.completed"
  | "workforce.task.blocked"
  | "workforce.message.sent"
  | "workforce.response.created"
  | "connector.execution.requested"
  | "connector.execution.completed"
  | "connector.execution.blocked"
  | "approval.requested"
  | "approval.resolved"
  | "skill.learned"
  | "julius.memory.recorded"
  | "system.health.changed"
  | "social.publish.requested"
  | "social.publish.completed"
  | "social.publish.failed";

export type EventPriority = "low" | "normal" | "high" | "critical";
export type EventRisk = "routine" | "approval" | "destructive";

export interface AiosActorIdentity {
  type: "founder" | "agent" | "system" | "worker";
  id: string;
}

export interface AiosEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  eventType: AiosEventType;
  eventVersion: 1;
  occurredAt: string;
  publishedAt: string;
  companyId: string | null;
  userId: string | null;
  actor: AiosActorIdentity;
  sourceAgent: string | null;
  targetAgent: string | null;
  audience: string[];
  taskRef: { type: "agent_message" | "agent_work_queue" | "work_item" | "social_publish_job" | "approval" | "connector"; id: string } | null;
  objectiveId: string | null;
  approvalId: string | null;
  risk: EventRisk;
  category: string | null;
  priority: EventPriority;
  traceId: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  attempt: number;
  maximumAttempts: number;
  scheduledFor: string | null;
  payload: TPayload;
  context: Record<string, unknown>;
  attachmentRefs: Array<{ id: string; kind: string; storageRef?: string; checksumSha256?: string }>;
  contentType: "application/vnd.aios.event+json";
}

export interface RetryPolicy {
  maximumAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maximumDelayMs: number;
}

export interface PublishResult {
  ok: boolean;
  eventId: string;
  idempotencyKey: string;
  status: "published" | "duplicate" | "scheduled" | "failed";
  transport: string;
  error?: string;
}

export interface DeliveryResult {
  ok: boolean;
  action: "ack" | "nack" | "retry" | "dead_letter";
  error?: string;
}

export interface HealthResult {
  ok: boolean;
  provider: string;
  status: "healthy" | "degraded" | "unavailable";
  details: Record<string, unknown>;
}

export interface DeadLetterRecord {
  id: string;
  eventId: string;
  eventType: AiosEventType;
  companyId: string | null;
  userId: string | null;
  consumerName: string;
  reason: string;
  attempts: number;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
  replayable: boolean;
}

export interface EventDelivery<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  deliveryId: string;
  consumerName: string;
  event: AiosEventEnvelope<TPayload>;
  receivedAt: string;
  attempt: number;
  leaseExpiresAt?: string | null;
  acknowledge: () => Promise<DeliveryResult>;
  negativeAcknowledge: (reason: string, opts?: { retry?: boolean; delayMs?: number }) => Promise<DeliveryResult>;
  deadLetter: (reason: string) => Promise<DeliveryResult>;
}

export type EventHandler<TPayload extends Record<string, unknown> = Record<string, unknown>> = (
  delivery: EventDelivery<TPayload>,
) => Promise<void>;

export interface EventMeshConsumer {
  consumerName: string;
  eventTypes: AiosEventType[];
  concurrency?: number;
  retryPolicy?: Partial<RetryPolicy>;
  handler: EventHandler;
}

export interface EventMeshPublisher {
  publish: (event: AiosEventEnvelope) => Promise<PublishResult>;
  publishBatch: (events: AiosEventEnvelope[]) => Promise<PublishResult[]>;
}

export interface EventMesh extends EventMeshPublisher {
  provider: string;
  registerConsumer: (consumer: EventMeshConsumer) => Promise<{ stop: () => Promise<void> }>;
  health: () => Promise<HealthResult>;
  replay: (eventId: string, opts?: { consumerName?: string; reason?: string }) => Promise<PublishResult>;
  shutdown: () => Promise<void>;
}

export interface EventMeshWorkerOptions {
  workerId: string;
  concurrency: number;
  handlerTimeoutMs: number;
  shutdownTimeoutMs: number;
}
