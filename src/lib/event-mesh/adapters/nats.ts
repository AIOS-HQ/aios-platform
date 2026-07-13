import "server-only";

import { Empty, JSONCodec, type NatsConnection, type JetStreamClient } from "nats";
import { validateAiosEventEnvelope } from "@/lib/event-mesh/envelope";
import { PostgresEventMesh } from "@/lib/event-mesh/adapters/postgres";
import type {
  AiosEventEnvelope,
  EventDelivery,
  EventMesh,
  EventMeshConsumer,
  HealthResult,
  PublishResult,
} from "@/lib/event-mesh/types";
import type { EventMeshRuntimeConfig } from "@/lib/event-mesh/config";

const STREAM = process.env.AIOS_EVENT_MESH_NATS_STREAM ?? "AIOS_EVENTS";
const SUBJECT_PREFIX = process.env.AIOS_EVENT_MESH_NATS_SUBJECT_PREFIX ?? "aios.events";

function subjectFor(event: Pick<AiosEventEnvelope, "eventType" | "companyId">): string {
  const company = event.companyId ?? "system";
  return `${SUBJECT_PREFIX}.${company}.${event.eventType}`;
}

function filterSubjectFor(eventTypes: string[]): string {
  if (eventTypes.length === 1) return `${SUBJECT_PREFIX}.*.${eventTypes[0]}`;
  return `${SUBJECT_PREFIX}.>`;
}

export class NatsJetStreamEventMesh implements EventMesh {
  provider = "nats";
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private codec = JSONCodec<AiosEventEnvelope>();
  private stops = new Set<() => void>();
  private sourceOfTruth: PostgresEventMesh | null = null;

  constructor(private readonly config: Pick<EventMeshRuntimeConfig, "workerId">) {}

  private postgresSource(): PostgresEventMesh {
    this.sourceOfTruth ??= new PostgresEventMesh({
      workerId: this.config.workerId,
      pollIntervalMs: 1000,
      leaseSeconds: 60,
      batchSize: 10,
    });
    return this.sourceOfTruth;
  }

  private async connect() {
    if (this.nc && this.js) return { nc: this.nc, js: this.js };
    const nats = await import("nats");
    const servers = (process.env.AIOS_EVENT_MESH_NATS_URL ?? "nats://127.0.0.1:4222").split(",");
    this.nc = await nats.connect({
      servers,
      name: this.config.workerId,
      token: process.env.AIOS_EVENT_MESH_NATS_TOKEN || undefined,
      user: process.env.AIOS_EVENT_MESH_NATS_USER || undefined,
      pass: process.env.AIOS_EVENT_MESH_NATS_PASSWORD || undefined,
      tls: process.env.AIOS_EVENT_MESH_NATS_TLS === "true" ? {} : undefined,
      reconnect: true,
      maxReconnectAttempts: -1,
    });
    const jsm = await this.nc.jetstreamManager();
    try {
      await jsm.streams.info(STREAM);
    } catch {
      await jsm.streams.add({
        name: STREAM,
        subjects: [`${SUBJECT_PREFIX}.>`],
        storage: nats.StorageType.File,
        retention: nats.RetentionPolicy.Limits,
        max_age: Number(process.env.AIOS_EVENT_MESH_NATS_MAX_AGE_NS ?? 14 * 24 * 60 * 60 * 1_000_000_000),
      });
    }
    this.js = this.nc.jetstream();
    return { nc: this.nc, js: this.js };
  }

  async publish(event: AiosEventEnvelope): Promise<PublishResult> {
    const envelope = validateAiosEventEnvelope(event);
    const persisted = await this.postgresSource().publish(envelope);
    if (!persisted.ok) return { ...persisted, transport: this.provider };
    try {
      const { js } = await this.connect();
      await js.publish(subjectFor(envelope), this.codec.encode(envelope), {
        msgID: envelope.idempotencyKey,
        headers: undefined,
      });
      return {
        ok: true,
        eventId: envelope.eventId,
        idempotencyKey: envelope.idempotencyKey,
        status: envelope.scheduledFor ? "scheduled" : "published",
        transport: this.provider,
      };
    } catch (error) {
      return {
        ok: false,
        eventId: envelope.eventId,
        idempotencyKey: envelope.idempotencyKey,
        status: "failed",
        transport: this.provider,
        error: error instanceof Error ? error.message : "nats_publish_failed",
      };
    }
  }

  async publishBatch(events: AiosEventEnvelope[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    for (const event of events) results.push(await this.publish(event));
    return results;
  }

  async registerConsumer(consumer: EventMeshConsumer): Promise<{ stop: () => Promise<void> }> {
    const { nc, js } = await this.connect();
    const nats = await import("nats");
    const durable = consumer.consumerName.replace(/[^A-Za-z0-9_-]/g, "_");
    const jsm = await nc.jetstreamManager();
    try {
      await jsm.consumers.info(STREAM, durable);
    } catch {
      await jsm.consumers.add(STREAM, {
        durable_name: durable,
        ack_policy: nats.AckPolicy.Explicit,
        deliver_policy: nats.DeliverPolicy.All,
        filter_subject: filterSubjectFor(consumer.eventTypes),
        ack_wait: Number(process.env.AIOS_EVENT_MESH_NATS_ACK_WAIT_NS ?? 30_000_000_000),
        max_deliver: consumer.retryPolicy?.maximumAttempts ?? 5,
      });
    }
    const pull = await js.consumers.get(STREAM, durable);
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        const messages = await pull.fetch({ max_messages: consumer.concurrency ?? 1, expires: 1000 });
        for await (const msg of messages) {
          if (stopped) {
            msg.nak();
            break;
          }
          const event = this.codec.decode(msg.data);
          if (!consumer.eventTypes.includes(event.eventType)) {
            msg.ack();
            continue;
          }
          const delivery: EventDelivery = {
            deliveryId: `${msg.info.streamSequence}`,
            consumerName: consumer.consumerName,
            event,
            receivedAt: new Date().toISOString(),
            attempt: msg.info.deliveryCount,
            acknowledge: async () => {
              msg.ack();
              return { ok: true, action: "ack" };
            },
            negativeAcknowledge: async (reason, opts) => {
              if (opts?.retry === false || msg.info.deliveryCount >= (consumer.retryPolicy?.maximumAttempts ?? 5)) {
                msg.term(reason.slice(0, 256));
                return { ok: true, action: "dead_letter" };
              }
              msg.nak(opts?.delayMs ?? undefined);
              return { ok: true, action: "retry" };
            },
            deadLetter: async (reason) => {
              msg.term(reason.slice(0, 256));
              return { ok: true, action: "dead_letter" };
            },
          };
          try {
            await consumer.handler(delivery);
          } catch (error) {
            await delivery.negativeAcknowledge(error instanceof Error ? error.message : "handler_failed", { retry: true });
          }
        }
      }
    };
    void loop();
    const stop = () => {
      stopped = true;
      this.stops.delete(stop);
    };
    this.stops.add(stop);
    return { stop: async () => stop() };
  }

  async replay(eventId: string): Promise<PublishResult> {
    return {
      ok: false,
      eventId,
      idempotencyKey: eventId,
      status: "failed",
      transport: this.provider,
      error: "nats_replay_requires_postgres_outbox_source",
    };
  }

  async health(): Promise<HealthResult> {
    try {
      const { nc } = await this.connect();
      return {
        ok: true,
        provider: this.provider,
        status: "healthy",
        details: {
          stream: STREAM,
          subjectPrefix: SUBJECT_PREFIX,
          connected: !nc.isClosed(),
          server: nc.getServer(),
        },
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        status: "unavailable",
        details: { error: error instanceof Error ? error.message : "nats_unavailable" },
      };
    }
  }

  async shutdown(): Promise<void> {
    for (const stop of Array.from(this.stops)) stop();
    this.stops.clear();
    if (this.nc && !this.nc.isClosed()) {
      await this.nc.publish(`${SUBJECT_PREFIX}.worker.${this.config.workerId}.shutdown`, Empty);
      await this.nc.drain();
    }
    this.nc = null;
    this.js = null;
  }
}
