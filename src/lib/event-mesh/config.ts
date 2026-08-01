import "server-only";

import type { EventMesh } from "@/lib/event-mesh/types";
import { AzureServiceBusEventMesh } from "@/lib/event-mesh/adapters/azure-service-bus";
import { LocalEventMesh } from "@/lib/event-mesh/adapters/local";
import { NatsJetStreamEventMesh } from "@/lib/event-mesh/adapters/nats";
import { PostgresEventMesh } from "@/lib/event-mesh/adapters/postgres";

export type EventMeshProviderName = "postgres" | "nats" | "local" | "azure-service-bus";

export interface AzureServiceBusConfig {
  namespace: string;
  topicName: string;
  subscriptionPrefix: string;
  replayTopicName: string | null;
  replaySubscriptionPrefix: string;
  disableReplay: boolean;
  maxConcurrentCalls: number;
  prefetchCount: number;
  maxAutoLockRenewalInMs: number;
}

export interface EventMeshRuntimeConfig {
  provider: EventMeshProviderName;
  workerId: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  batchSize: number;
  localAllowed: boolean;
  azureServiceBus: AzureServiceBusConfig;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEventMeshConfig(env: NodeJS.ProcessEnv = process.env): EventMeshRuntimeConfig {
  const provider = (env.AIOS_EVENT_MESH_PROVIDER ?? (env.NODE_ENV === "test" ? "local" : "postgres")) as EventMeshProviderName;
  if (!["postgres", "nats", "local", "azure-service-bus"].includes(provider)) {
    throw new Error(`Unsupported AIOS_EVENT_MESH_PROVIDER: ${provider}`);
  }
  const localAllowed = env.NODE_ENV !== "production" || env.AIOS_EVENT_MESH_ALLOW_LOCAL === "true";
  if (provider === "local" && !localAllowed) {
    throw new Error("AIOS_EVENT_MESH_PROVIDER=local is not allowed in production unless AIOS_EVENT_MESH_ALLOW_LOCAL=true.");
  }
  return {
    provider,
    workerId: env.AIOS_EVENT_MESH_WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: Number(env.AIOS_EVENT_MESH_POLL_INTERVAL_MS ?? 1000),
    leaseSeconds: Number(env.AIOS_EVENT_MESH_LEASE_SECONDS ?? 60),
    batchSize: Number(env.AIOS_EVENT_MESH_BATCH_SIZE ?? 10),
    localAllowed,
    azureServiceBus: {
      namespace: provider === "azure-service-bus" ? requireEnv(env, "AIOS_EVENT_MESH_AZURE_SERVICEBUS_NAMESPACE") : (env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_NAMESPACE ?? ""),
      topicName: env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_TOPIC ?? "aios-runtime-r1-events",
      subscriptionPrefix: env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_SUBSCRIPTION_PREFIX ?? "aios-runtime-r1",
      replayTopicName: env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_REPLAY_TOPIC ?? null,
      replaySubscriptionPrefix: env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_REPLAY_SUBSCRIPTION_PREFIX ?? "aios-runtime-r1-replay",
      disableReplay: env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_DISABLE_REPLAY === "true",
      maxConcurrentCalls: Number(env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_MAX_CONCURRENT_CALLS ?? 8),
      prefetchCount: Number(env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_PREFETCH_COUNT ?? 20),
      maxAutoLockRenewalInMs: Number(env.AIOS_EVENT_MESH_AZURE_SERVICEBUS_MAX_AUTO_LOCK_RENEWAL_MS ?? 120000),
    },
  };
}

let singleton: EventMesh | null = null;

export function createEventMesh(config: EventMeshRuntimeConfig = getEventMeshConfig()): EventMesh {
  if (config.provider === "local") return new LocalEventMesh();
  if (config.provider === "nats") return new NatsJetStreamEventMesh(config);
  if (config.provider === "azure-service-bus") return new AzureServiceBusEventMesh(config);
  return new PostgresEventMesh(config);
}

export function getEventMesh(): EventMesh {
  singleton ??= createEventMesh();
  return singleton;
}

export function resetEventMeshForTests(): void {
  singleton = null;
}
