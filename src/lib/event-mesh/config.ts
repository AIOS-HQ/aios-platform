import "server-only";

import type { EventMesh } from "@/lib/event-mesh/types";
import { LocalEventMesh } from "@/lib/event-mesh/adapters/local";
import { NatsJetStreamEventMesh } from "@/lib/event-mesh/adapters/nats";
import { PostgresEventMesh } from "@/lib/event-mesh/adapters/postgres";

export type EventMeshProviderName = "postgres" | "nats" | "local";

export interface EventMeshRuntimeConfig {
  provider: EventMeshProviderName;
  workerId: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  batchSize: number;
  localAllowed: boolean;
}

export function getEventMeshConfig(env: NodeJS.ProcessEnv = process.env): EventMeshRuntimeConfig {
  const provider = (env.AIOS_EVENT_MESH_PROVIDER ?? (env.NODE_ENV === "test" ? "local" : "postgres")) as EventMeshProviderName;
  if (!["postgres", "nats", "local"].includes(provider)) {
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
  };
}

let singleton: EventMesh | null = null;

export function createEventMesh(config: EventMeshRuntimeConfig = getEventMeshConfig()): EventMesh {
  if (config.provider === "local") return new LocalEventMesh();
  if (config.provider === "nats") return new NatsJetStreamEventMesh(config);
  return new PostgresEventMesh(config);
}

export function getEventMesh(): EventMesh {
  singleton ??= createEventMesh();
  return singleton;
}

export function resetEventMeshForTests(): void {
  singleton = null;
}
