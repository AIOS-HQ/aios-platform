import { validateAiosEventEnvelope } from "@/lib/event-mesh/envelope";
import type {
  AiosEventEnvelope,
  DeadLetterRecord,
  DeliveryResult,
  EventDelivery,
  EventMesh,
  EventMeshConsumer,
  HealthResult,
  PublishResult,
} from "@/lib/event-mesh/types";

interface LocalRecord {
  deliveryId: string;
  event: AiosEventEnvelope;
  consumerName: string;
  status: "pending" | "acked" | "dead_letter";
  attempt: number;
  availableAt: number;
  lastError?: string;
}

export class LocalEventMesh implements EventMesh {
  provider = "local";
  private records: LocalRecord[] = [];
  private deadLetters: DeadLetterRecord[] = [];
  private consumers = new Map<string, EventMeshConsumer>();
  private timers = new Set<NodeJS.Timeout>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async publish(event: AiosEventEnvelope): Promise<PublishResult> {
    const envelope = validateAiosEventEnvelope(event);
    const duplicate = this.records.some((record) => record.event.idempotencyKey === envelope.idempotencyKey);
    if (duplicate) {
      return {
        ok: true,
        eventId: envelope.eventId,
        idempotencyKey: envelope.idempotencyKey,
        status: "duplicate",
        transport: this.provider,
      };
    }
    const consumerNames = Array.from(this.consumers.values())
      .filter((consumer) => consumer.eventTypes.includes(envelope.eventType))
      .map((consumer) => consumer.consumerName);
    const targets = consumerNames.length > 0 ? consumerNames : ["event-mesh-default"];
    for (const consumerName of targets) {
      this.records.push({
        deliveryId: `${envelope.eventId}:${consumerName}`,
        event: envelope,
        consumerName,
        status: "pending",
        attempt: envelope.attempt,
        availableAt: envelope.scheduledFor ? Date.parse(envelope.scheduledFor) : this.now(),
      });
    }
    return {
      ok: true,
      eventId: envelope.eventId,
      idempotencyKey: envelope.idempotencyKey,
      status: envelope.scheduledFor ? "scheduled" : "published",
      transport: this.provider,
    };
  }

  async publishBatch(events: AiosEventEnvelope[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    for (const event of events) results.push(await this.publish(event));
    return results;
  }

  async registerConsumer(consumer: EventMeshConsumer): Promise<{ stop: () => Promise<void> }> {
    this.consumers.set(consumer.consumerName, consumer);
    const timer = setInterval(() => {
      void this.drainConsumer(consumer.consumerName, consumer.concurrency ?? 1);
    }, 10);
    this.timers.add(timer);
    return {
      stop: async () => {
        clearInterval(timer);
        this.timers.delete(timer);
        this.consumers.delete(consumer.consumerName);
      },
    };
  }

  async drainConsumer(consumerName: string, limit = 10): Promise<number> {
    const consumer = this.consumers.get(consumerName);
    if (!consumer) return 0;
    const pending = this.records
      .filter((record) => record.consumerName === consumerName && record.status === "pending" && record.availableAt <= this.now())
      .slice(0, limit);
    for (const record of pending) {
      const delivery = this.delivery(record);
      try {
        await consumer.handler(delivery);
      } catch (error) {
        await delivery.negativeAcknowledge(error instanceof Error ? error.message : "handler_failed", { retry: true });
      }
    }
    return pending.length;
  }

  private delivery(record: LocalRecord): EventDelivery {
    return {
      deliveryId: record.deliveryId,
      consumerName: record.consumerName,
      event: record.event,
      receivedAt: new Date(this.now()).toISOString(),
      attempt: record.attempt,
      acknowledge: async () => {
        record.status = "acked";
        return { ok: true, action: "ack" };
      },
      negativeAcknowledge: async (reason, opts) => {
        record.attempt += 1;
        record.lastError = reason;
        if (!opts?.retry || record.attempt >= record.event.maximumAttempts) {
          return this.moveToDeadLetter(record, reason);
        }
        record.availableAt = this.now() + (opts.delayMs ?? 1000);
        return { ok: true, action: "retry" };
      },
      deadLetter: async (reason) => this.moveToDeadLetter(record, reason),
    };
  }

  private async moveToDeadLetter(record: LocalRecord, reason: string): Promise<DeliveryResult> {
    record.status = "dead_letter";
    this.deadLetters.push({
      id: `dlq:${record.deliveryId}`,
      eventId: record.event.eventId,
      eventType: record.event.eventType,
      companyId: record.event.companyId,
      userId: record.event.userId,
      consumerName: record.consumerName,
      reason,
      attempts: record.attempt,
      safeMetadata: { taskRef: record.event.taskRef, traceId: record.event.traceId },
      createdAt: new Date(this.now()).toISOString(),
      replayable: record.event.risk !== "destructive",
    });
    return { ok: true, action: "dead_letter" };
  }

  async replay(eventId: string, opts?: { consumerName?: string; reason?: string }): Promise<PublishResult> {
    const record = this.records.find((item) => item.event.eventId === eventId && (!opts?.consumerName || item.consumerName === opts.consumerName));
    if (!record) {
      return { ok: false, eventId, idempotencyKey: eventId, status: "failed", transport: this.provider, error: "event_not_found" };
    }
    if (record.event.risk === "destructive") {
      return { ok: false, eventId, idempotencyKey: record.event.idempotencyKey, status: "failed", transport: this.provider, error: "destructive_replay_blocked" };
    }
    record.status = "pending";
    record.availableAt = this.now();
    record.lastError = opts?.reason ?? "manual_replay";
    return { ok: true, eventId, idempotencyKey: record.event.idempotencyKey, status: "published", transport: this.provider };
  }

  async health(): Promise<HealthResult> {
    return {
      ok: true,
      provider: this.provider,
      status: "healthy",
      details: {
        pending: this.records.filter((record) => record.status === "pending").length,
        deadLetters: this.deadLetters.length,
        consumers: this.consumers.size,
      },
    };
  }

  inspect() {
    return { records: this.records, deadLetters: this.deadLetters };
  }

  async shutdown(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.clear();
    this.consumers.clear();
  }
}
