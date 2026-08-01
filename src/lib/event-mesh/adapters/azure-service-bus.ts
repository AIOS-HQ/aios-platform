import "server-only";

import { DefaultAzureCredential } from "@azure/identity";
import {
  ServiceBusAdministrationClient,
  ServiceBusClient,
  type ServiceBusMessageBatch,
  type ServiceBusMessage,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
  type ServiceBusSender,
} from "@azure/service-bus";

import type { EventMeshRuntimeConfig } from "@/lib/event-mesh/config";
import { validateAiosEventEnvelope } from "@/lib/event-mesh/envelope";
import type {
  AiosEventEnvelope,
  DeliveryResult,
  EventDelivery,
  EventMesh,
  EventMeshConsumer,
  HealthResult,
  PublishResult,
} from "@/lib/event-mesh/types";

function buildFullyQualifiedNamespace(namespace: string): string {
  if (namespace.includes(".")) return namespace;
  return `${namespace}.servicebus.windows.net`;
}

function makeSubscriptionName(prefix: string, consumerName: string): string {
  const safe = `${prefix}-${consumerName}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
  return safe;
}

function encodeEnvelope(event: AiosEventEnvelope): ServiceBusMessage {
  return {
    body: JSON.stringify(event),
    messageId: event.idempotencyKey,
    contentType: event.contentType,
    correlationId: event.correlationId,
    subject: event.eventType,
    sessionId: event.companyId ?? undefined,
    applicationProperties: {
      eventId: event.eventId,
      traceId: event.traceId,
      companyId: event.companyId,
      approvalId: event.approvalId,
      risk: event.risk,
      attempt: event.attempt,
    },
  };
}

function decodeEnvelope(message: ServiceBusReceivedMessage): AiosEventEnvelope {
  const body = message.body as unknown;
  let parsed: unknown;

  if (typeof body === "string") {
    parsed = JSON.parse(body);
  } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    parsed = JSON.parse(Buffer.from(body).toString("utf8"));
  } else if (typeof body === "object" && body !== null) {
    parsed = body;
  } else {
    throw new Error("invalid_event_envelope:unsupported_body_type");
  }

  try {
    return validateAiosEventEnvelope(parsed);
  } catch (error) {
    throw new Error(`invalid_event_envelope:${error instanceof Error ? error.message : String(error)}`);
  }
}

export class AzureServiceBusEventMesh implements EventMesh {
  provider = "azure-service-bus" as const;

  private readonly fqNamespace: string;
  private readonly topicName: string;
  private readonly replayTopicName: string | null;
  private readonly subscriptionPrefix: string;
  private readonly replaySubscriptionPrefix: string;
  private readonly disableReplay: boolean;
  private readonly serviceBusClient: ServiceBusClient;
  private readonly adminClient: ServiceBusAdministrationClient;
  private readonly sender: ServiceBusSender;
  private readonly stops = new Set<() => Promise<void>>();

  constructor(private readonly config: Pick<EventMeshRuntimeConfig, "workerId" | "azureServiceBus">) {
    this.fqNamespace = buildFullyQualifiedNamespace(config.azureServiceBus.namespace);
    this.topicName = config.azureServiceBus.topicName;
    this.replayTopicName = config.azureServiceBus.replayTopicName;
    this.subscriptionPrefix = config.azureServiceBus.subscriptionPrefix;
    this.replaySubscriptionPrefix = config.azureServiceBus.replaySubscriptionPrefix;
    this.disableReplay = config.azureServiceBus.disableReplay;

    const credential = new DefaultAzureCredential();
    this.serviceBusClient = new ServiceBusClient(this.fqNamespace, credential);
    this.adminClient = new ServiceBusAdministrationClient(this.fqNamespace, credential);
    this.sender = this.serviceBusClient.createSender(this.topicName);
  }

  async publish(event: AiosEventEnvelope): Promise<PublishResult> {
    try {
      validateAiosEventEnvelope(event);
    } catch (error) {
      return {
        ok: false,
        eventId: (event as Partial<AiosEventEnvelope>)?.eventId ?? "unknown_event",
        idempotencyKey: (event as Partial<AiosEventEnvelope>)?.idempotencyKey ?? "unknown_idempotency_key",
        status: "failed",
        transport: this.provider,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      const batch = (await this.sender.createMessageBatch()) as ServiceBusMessageBatch;
      const message = encodeEnvelope(event);
      if (!batch.tryAddMessage(message)) {
        throw new Error("message_too_large_for_batch");
      }
      await this.sender.sendMessages(batch);
      return {
        ok: true,
        eventId: event.eventId,
        idempotencyKey: event.idempotencyKey,
        status: "published",
        transport: this.provider,
      };
    } catch (error) {
      return {
        ok: false,
        eventId: event.eventId,
        idempotencyKey: event.idempotencyKey,
        status: "failed",
        transport: this.provider,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async publishBatch(events: AiosEventEnvelope[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    let batch = (await this.sender.createMessageBatch()) as ServiceBusMessageBatch;
    const pending: AiosEventEnvelope[] = [];

    const flush = async (): Promise<void> => {
      if (!pending.length) return;
      try {
        await this.sender.sendMessages(batch);
        for (const event of pending) {
          results.push({ ok: true, eventId: event.eventId, idempotencyKey: event.idempotencyKey, status: "published", transport: this.provider });
        }
      } catch (error) {
        for (const event of pending) {
          results.push({
            ok: false,
            eventId: event.eventId,
            idempotencyKey: event.idempotencyKey,
            status: "failed",
            transport: this.provider,
            error: error instanceof Error ? error.message : "batch_publish_failed",
          });
        }
      }
      pending.length = 0;
      batch = (await this.sender.createMessageBatch()) as ServiceBusMessageBatch;
    };

    for (const event of events) {
      try {
        validateAiosEventEnvelope(event);
      } catch (error) {
        results.push({
          ok: false,
          eventId: event.eventId,
          idempotencyKey: event.idempotencyKey,
          status: "failed",
          transport: this.provider,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const message = encodeEnvelope(event);
      if (!batch.tryAddMessage(message)) {
        await flush();
        if (!batch.tryAddMessage(message)) {
          results.push({
            ok: false,
            eventId: event.eventId,
            idempotencyKey: event.idempotencyKey,
            status: "failed",
            transport: this.provider,
            error: "message_too_large_for_batch",
          });
          continue;
        }
      }
      pending.push(event);
    }
    await flush();
    return results;
  }

  private async ensureSubscription(consumer: EventMeshConsumer): Promise<void> {
    const name = makeSubscriptionName(this.subscriptionPrefix, consumer.consumerName);
    const exists = await this.adminClient.subscriptionExists(this.topicName, name);
    if (!exists) {
      await this.adminClient.createSubscription(this.topicName, name);
    }
  }

  async registerConsumer(consumer: EventMeshConsumer): Promise<{ stop: () => Promise<void> }> {
    await this.ensureSubscription(consumer);
    const subscriptionName = makeSubscriptionName(this.subscriptionPrefix, consumer.consumerName);
    const receiver: ServiceBusReceiver = this.serviceBusClient.createReceiver(this.topicName, subscriptionName, {
      receiveMode: "peekLock",
    });

    const close = async (): Promise<void> => {
      await receiver.close();
    };

    receiver.subscribe(
      {
        processMessage: async (message) => {
          const envelope = decodeEnvelope(message);
          if (!consumer.eventTypes.includes(envelope.eventType)) {
            await receiver.completeMessage(message);
            return;
          }
          const delivery: EventDelivery = {
            deliveryId: String(message.messageId ?? envelope.eventId),
            consumerName: consumer.consumerName,
            event: envelope,
            receivedAt: new Date().toISOString(),
            attempt: typeof message.deliveryCount === "number" ? message.deliveryCount : 1,
            leaseExpiresAt: null,
            acknowledge: async (): Promise<DeliveryResult> => {
              await receiver.completeMessage(message);
              return { ok: true, action: "ack" };
            },
            negativeAcknowledge: async (reason: string, opts?: { retry?: boolean }): Promise<DeliveryResult> => {
              if (opts?.retry === false) {
                await receiver.deadLetterMessage(message, {
                  deadLetterReason: reason,
                  deadLetterErrorDescription: reason,
                });
                return { ok: true, action: "dead_letter" };
              }
              await receiver.abandonMessage(message, {
                reason,
              });
              return { ok: true, action: "retry" };
            },
            deadLetter: async (reason: string): Promise<DeliveryResult> => {
              await receiver.deadLetterMessage(message, {
                deadLetterReason: reason,
                deadLetterErrorDescription: reason,
              });
              return { ok: true, action: "dead_letter" };
            },
          };

          await consumer.handler(delivery);
        },
        processError: async () => {
          return;
        },
      },
      {
        autoCompleteMessages: false,
        maxConcurrentCalls: this.config.azureServiceBus.maxConcurrentCalls,
      },
    );

    this.stops.add(close);
    return {
      stop: async () => {
        this.stops.delete(close);
        await close();
      },
    };
  }

  async health(): Promise<HealthResult> {
    try {
      const topic = await this.adminClient.getTopic(this.topicName);
      return {
        ok: true,
        provider: this.provider,
        status: "healthy",
        details: {
          namespace: this.fqNamespace,
          topicName: this.topicName,
          status: topic.status,
          subscriptionPrefix: this.subscriptionPrefix,
        },
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        status: "degraded",
        details: {
          namespace: this.fqNamespace,
          topicName: this.topicName,
          error: error instanceof Error ? error.message : "health_check_failed",
        },
      };
    }
  }

  async replay(eventId: string, opts?: { consumerName?: string; reason?: string }): Promise<PublishResult> {
    if (this.disableReplay || !this.replayTopicName) {
      return {
        ok: false,
        eventId,
        idempotencyKey: eventId,
        status: "failed",
        transport: this.provider,
        error: "replay_not_supported_without_replay_topic",
      };
    }
    const replaySender = this.serviceBusClient.createSender(this.replayTopicName);
    try {
      await replaySender.sendMessages({
        body: JSON.stringify({ eventId, consumerName: opts?.consumerName ?? null, reason: opts?.reason ?? "manual_replay" }),
        messageId: eventId,
        contentType: "application/json",
        subject: "event-mesh.replay.requested",
        applicationProperties: {
          replaySubscriptionPrefix: this.replaySubscriptionPrefix,
        },
      });
      return { ok: true, eventId, idempotencyKey: eventId, status: "published", transport: this.provider };
    } catch (error) {
      return {
        ok: false,
        eventId,
        idempotencyKey: eventId,
        status: "failed",
        transport: this.provider,
        error: error instanceof Error ? error.message : "replay_failed",
      };
    } finally {
      await replaySender.close();
    }
  }

  async shutdown(): Promise<void> {
    for (const stop of Array.from(this.stops)) {
      await stop();
    }
    this.stops.clear();
    await this.sender.close();
    await this.serviceBusClient.close();
  }
}
