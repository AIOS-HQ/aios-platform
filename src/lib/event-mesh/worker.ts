import "server-only";

import { getEventMesh } from "@/lib/event-mesh/config";
import { createWorkforceEventConsumer } from "@/lib/event-mesh/workforce-handlers";
import type { EventMesh, EventMeshConsumer, EventMeshWorkerOptions, HealthResult } from "@/lib/event-mesh/types";

const DEFAULT_WORKER_OPTIONS: EventMeshWorkerOptions = {
  workerId: process.env.AIOS_EVENT_MESH_WORKER_ID ?? `worker-${process.pid}`,
  concurrency: Number(process.env.AIOS_EVENT_MESH_WORKER_CONCURRENCY ?? 4),
  handlerTimeoutMs: Number(process.env.AIOS_EVENT_MESH_HANDLER_TIMEOUT_MS ?? 30000),
  shutdownTimeoutMs: Number(process.env.AIOS_EVENT_MESH_SHUTDOWN_TIMEOUT_MS ?? 10000),
};

export interface EventMeshWorker {
  workerId: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  health: () => Promise<HealthResult>;
}

function withTimeout(consumer: EventMeshConsumer, timeoutMs: number): EventMeshConsumer {
  return {
    ...consumer,
    handler: async (delivery) => {
      let timeout: NodeJS.Timeout | null = null;
      await Promise.race([
        consumer.handler(delivery),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("event_handler_timeout")), timeoutMs);
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
    },
  };
}

export function createEventMeshWorker(input: {
  mesh?: EventMesh;
  consumers?: EventMeshConsumer[];
  options?: Partial<EventMeshWorkerOptions>;
} = {}): EventMeshWorker {
  const mesh = input.mesh ?? getEventMesh();
  const options = { ...DEFAULT_WORKER_OPTIONS, ...input.options };
  const consumers = input.consumers ?? [createWorkforceEventConsumer()];
  const stops: Array<() => Promise<void>> = [];
  let started = false;

  return {
    workerId: options.workerId,
    start: async () => {
      if (started) return;
      for (const consumer of consumers) {
        const registration = await mesh.registerConsumer(withTimeout(consumer, options.handlerTimeoutMs));
        stops.push(registration.stop);
      }
      started = true;
    },
    stop: async () => {
      const deadline = Date.now() + options.shutdownTimeoutMs;
      for (const stop of stops.splice(0)) {
        if (Date.now() > deadline) break;
        await stop();
      }
      await mesh.shutdown();
      started = false;
    },
    health: () => mesh.health(),
  };
}

export async function runEventMeshWorker(): Promise<void> {
  const worker = createEventMeshWorker();
  await worker.start();
  const shutdown = async () => {
    await worker.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.info(`[event-mesh] worker ${worker.workerId} started`);
}
