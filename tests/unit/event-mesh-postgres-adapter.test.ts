import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAiosEventEnvelope } from "@/lib/event-mesh/envelope";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

describe("PostgresEventMesh", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("publishes through the durable RPC", async () => {
    rpc.mockResolvedValueOnce({ data: { duplicate: false, scheduled: false }, error: null });
    const { PostgresEventMesh } = await import("@/lib/event-mesh/adapters/postgres");
    const mesh = new PostgresEventMesh({ workerId: "worker", pollIntervalMs: 1000, leaseSeconds: 60, batchSize: 10 });
    const event = createAiosEventEnvelope({ eventType: "system.health.changed" });

    const result = await mesh.publish(event);

    expect(result).toMatchObject({ ok: true, status: "published", transport: "postgres" });
    expect(rpc).toHaveBeenCalledWith("publish_event_mesh_event", expect.objectContaining({ p_event: event }));
  });

  it("claims, handles, and acknowledges deliveries once", async () => {
    const event = createAiosEventEnvelope({ eventType: "system.health.changed" });
    rpc
      .mockResolvedValueOnce({
        data: [{
          delivery_id: "delivery-1",
          consumer_name: "consumer",
          attempt: 1,
          lease_expires_at: "2026-07-13T00:00:00.000Z",
          event,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const { PostgresEventMesh } = await import("@/lib/event-mesh/adapters/postgres");
    const mesh = new PostgresEventMesh({ workerId: "worker", pollIntervalMs: 1000, leaseSeconds: 60, batchSize: 10 });

    const count = await mesh.drainConsumer({
      consumerName: "consumer",
      eventTypes: ["system.health.changed"],
      handler: async (delivery) => {
        await delivery.acknowledge();
      },
    });

    expect(count).toBe(1);
    expect(rpc).toHaveBeenNthCalledWith(2, "ack_event_mesh_delivery", { p_delivery_id: "delivery-1", p_worker: "worker" });
  });
});
