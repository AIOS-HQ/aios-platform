import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateAiosEventEnvelope, safeEventMetadata } from "@/lib/event-mesh/envelope";
import type {
  AiosEventEnvelope,
  DeliveryResult,
  EventDelivery,
  EventMesh,
  EventMeshConsumer,
  HealthResult,
  PublishResult,
} from "@/lib/event-mesh/types";
import type { EventMeshRuntimeConfig } from "@/lib/event-mesh/config";

interface ClaimedDeliveryRow {
  delivery_id: string;
  consumer_name: string;
  attempt: number;
  lease_expires_at: string | null;
  event: AiosEventEnvelope;
}

export class PostgresEventMesh implements EventMesh {
  provider = "postgres";
  private stops = new Set<() => void>();

  constructor(private readonly config: Pick<EventMeshRuntimeConfig, "workerId" | "pollIntervalMs" | "leaseSeconds" | "batchSize">) {}

  async publish(event: AiosEventEnvelope): Promise<PublishResult> {
    const envelope = validateAiosEventEnvelope(event);
    const admin = createAdminClient();
    if (!admin) {
      return {
        ok: false,
        eventId: envelope.eventId,
        idempotencyKey: envelope.idempotencyKey,
        status: "failed",
        transport: this.provider,
        error: "admin_client_unavailable",
      };
    }
    const { data, error } = await admin.rpc("publish_event_mesh_event", {
      p_event: envelope,
      p_consumer: null,
    });
    if (error) {
      return {
        ok: false,
        eventId: envelope.eventId,
        idempotencyKey: envelope.idempotencyKey,
        status: "failed",
        transport: this.provider,
        error: error.message,
      };
    }
    const result = (data ?? {}) as { duplicate?: boolean; scheduled?: boolean };
    return {
      ok: true,
      eventId: envelope.eventId,
      idempotencyKey: envelope.idempotencyKey,
      status: result.duplicate ? "duplicate" : result.scheduled ? "scheduled" : "published",
      transport: this.provider,
    };
  }

  async publishBatch(events: AiosEventEnvelope[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    for (const event of events) results.push(await this.publish(event));
    return results;
  }

  async registerConsumer(consumer: EventMeshConsumer): Promise<{ stop: () => Promise<void> }> {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await this.drainConsumer(consumer);
    };
    const timer = setInterval(() => {
      void tick();
    }, this.config.pollIntervalMs);
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      this.stops.delete(stop);
    };
    this.stops.add(stop);
    void tick();
    return { stop: async () => stop() };
  }

  async drainConsumer(consumer: EventMeshConsumer): Promise<number> {
    const admin = createAdminClient();
    if (!admin) return 0;
    const { data, error } = await admin.rpc("claim_event_mesh_deliveries", {
      p_consumer: consumer.consumerName,
      p_worker: this.config.workerId,
      p_event_types: consumer.eventTypes,
      p_limit: consumer.concurrency ?? this.config.batchSize,
      p_lease_seconds: this.config.leaseSeconds,
    });
    if (error) {
      console.error("[event-mesh/postgres] claim", error.message);
      return 0;
    }
    const rows = (data ?? []) as ClaimedDeliveryRow[];
    await Promise.all(rows.map((row) => this.handleClaimed(row, consumer)));
    return rows.length;
  }

  private async handleClaimed(row: ClaimedDeliveryRow, consumer: EventMeshConsumer): Promise<void> {
    const delivery = this.delivery(row);
    try {
      await consumer.handler(delivery);
    } catch (error) {
      await delivery.negativeAcknowledge(error instanceof Error ? error.message : "handler_failed", { retry: true });
    }
  }

  private delivery(row: ClaimedDeliveryRow): EventDelivery {
    return {
      deliveryId: row.delivery_id,
      consumerName: row.consumer_name,
      event: row.event,
      receivedAt: new Date().toISOString(),
      attempt: row.attempt,
      leaseExpiresAt: row.lease_expires_at,
      acknowledge: async () => this.ack(row.delivery_id),
      negativeAcknowledge: async (reason, opts) => this.nack(row.delivery_id, reason, opts),
      deadLetter: async (reason) => this.deadLetter(row.delivery_id, reason, row.event),
    };
  }

  private async ack(deliveryId: string): Promise<DeliveryResult> {
    const admin = createAdminClient();
    if (!admin) return { ok: false, action: "ack", error: "admin_client_unavailable" };
    const { error } = await admin.rpc("ack_event_mesh_delivery", { p_delivery_id: deliveryId, p_worker: this.config.workerId });
    return error ? { ok: false, action: "ack", error: error.message } : { ok: true, action: "ack" };
  }

  private async nack(deliveryId: string, reason: string, opts?: { retry?: boolean; delayMs?: number }): Promise<DeliveryResult> {
    const admin = createAdminClient();
    if (!admin) return { ok: false, action: "nack", error: "admin_client_unavailable" };
    const { data, error } = await admin.rpc("nack_event_mesh_delivery", {
      p_delivery_id: deliveryId,
      p_worker: this.config.workerId,
      p_reason: reason.slice(0, 1000),
      p_retry: opts?.retry !== false,
      p_delay_ms: opts?.delayMs ?? null,
    });
    if (error) return { ok: false, action: "nack", error: error.message };
    const action = ((data as { action?: DeliveryResult["action"] } | null)?.action ?? "retry") as DeliveryResult["action"];
    return { ok: true, action };
  }

  private async deadLetter(deliveryId: string, reason: string, event: AiosEventEnvelope): Promise<DeliveryResult> {
    const admin = createAdminClient();
    if (!admin) return { ok: false, action: "dead_letter", error: "admin_client_unavailable" };
    const { error } = await admin.rpc("dead_letter_event_mesh_delivery", {
      p_delivery_id: deliveryId,
      p_worker: this.config.workerId,
      p_reason: reason.slice(0, 1000),
      p_safe_metadata: safeEventMetadata(event),
    });
    return error ? { ok: false, action: "dead_letter", error: error.message } : { ok: true, action: "dead_letter" };
  }

  async replay(eventId: string, opts?: { consumerName?: string; reason?: string }): Promise<PublishResult> {
    const admin = createAdminClient();
    if (!admin) return { ok: false, eventId, idempotencyKey: eventId, status: "failed", transport: this.provider, error: "admin_client_unavailable" };
    const { data, error } = await admin.rpc("replay_event_mesh_event", {
      p_event_id: eventId,
      p_consumer: opts?.consumerName ?? null,
      p_reason: opts?.reason ?? "manual_replay",
    });
    if (error) return { ok: false, eventId, idempotencyKey: eventId, status: "failed", transport: this.provider, error: error.message };
    return {
      ok: true,
      eventId,
      idempotencyKey: ((data as { idempotency_key?: string } | null)?.idempotency_key ?? eventId),
      status: "published",
      transport: this.provider,
    };
  }

  async health(): Promise<HealthResult> {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, provider: this.provider, status: "unavailable", details: { reason: "admin_client_unavailable" } };
    }
    const { data, error } = await admin.rpc("event_mesh_health");
    if (error) {
      return { ok: false, provider: this.provider, status: "degraded", details: { error: error.message } };
    }
    return { ok: true, provider: this.provider, status: "healthy", details: (data ?? {}) as Record<string, unknown> };
  }

  async shutdown(): Promise<void> {
    for (const stop of Array.from(this.stops)) stop();
    this.stops.clear();
  }
}
