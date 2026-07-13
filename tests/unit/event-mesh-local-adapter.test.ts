import { describe, expect, it, vi } from "vitest";
import { createAiosEventEnvelope } from "@/lib/event-mesh/envelope";
import { LocalEventMesh } from "@/lib/event-mesh/adapters/local";

describe("LocalEventMesh", () => {
  it("delivers deterministically and acknowledges", async () => {
    const mesh = new LocalEventMesh(() => 1000);
    const seen: string[] = [];
    await mesh.registerConsumer({
      consumerName: "test-consumer",
      eventTypes: ["system.health.changed"],
      handler: vi.fn(async (delivery) => {
        seen.push(delivery.event.eventId);
        await delivery.acknowledge();
      }),
    });
    const event = createAiosEventEnvelope({ eventType: "system.health.changed", payload: { status: "ok" } });

    await mesh.publish(event);
    await mesh.drainConsumer("test-consumer");

    expect(seen).toEqual([event.eventId]);
    expect((await mesh.health()).details.pending).toBe(0);
  });

  it("retries then dead-letters failed deliveries", async () => {
    const mesh = new LocalEventMesh(() => 1000);
    await mesh.registerConsumer({
      consumerName: "test-consumer",
      eventTypes: ["system.health.changed"],
      handler: async (delivery) => {
        await delivery.negativeAcknowledge("failed", { retry: false });
      },
    });

    await mesh.publish(createAiosEventEnvelope({
      eventType: "system.health.changed",
      maximumAttempts: 1,
      payload: { status: "bad" },
    }));
    await mesh.drainConsumer("test-consumer");

    expect(mesh.inspect().deadLetters).toHaveLength(1);
    expect((await mesh.health()).details.deadLetters).toBe(1);
  });
});
