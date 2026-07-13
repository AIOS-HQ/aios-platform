import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAiosEventEnvelope } from "@/lib/event-mesh/envelope";

const rpc = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const connect = vi.hoisted(() => vi.fn());
const streamsInfo = vi.hoisted(() => vi.fn());
const streamsAdd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

vi.mock("nats", () => ({
  Empty: new Uint8Array(),
  StorageType: { File: "file" },
  RetentionPolicy: { Limits: "limits" },
  AckPolicy: { Explicit: "explicit" },
  DeliverPolicy: { All: "all" },
  JSONCodec: () => ({
    encode: (value: unknown) => Buffer.from(JSON.stringify(value)),
    decode: (value: Uint8Array) => JSON.parse(Buffer.from(value).toString("utf8")),
  }),
  StringCodec: () => ({ encode: (value: string) => Buffer.from(value) }),
  connect,
}));

describe("NatsJetStreamEventMesh", () => {
  beforeEach(() => {
    rpc.mockReset();
    publish.mockReset();
    streamsInfo.mockReset();
    streamsAdd.mockReset();
    connect.mockReset();
    rpc.mockResolvedValue({ data: { duplicate: false }, error: null });
    streamsInfo.mockResolvedValue({});
    connect.mockResolvedValue({
      jetstreamManager: async () => ({ streams: { info: streamsInfo, add: streamsAdd }, consumers: { info: vi.fn(), add: vi.fn() } }),
      jetstream: () => ({ publish }),
      isClosed: () => false,
      getServer: () => "nats://test",
      publish: vi.fn(),
      drain: vi.fn(),
    });
    publish.mockResolvedValue({});
  });

  it("persists to Postgres before publishing to JetStream", async () => {
    const { NatsJetStreamEventMesh } = await import("@/lib/event-mesh/adapters/nats");
    const mesh = new NatsJetStreamEventMesh({ workerId: "worker" });
    const event = createAiosEventEnvelope({ eventType: "system.health.changed", companyId: null });

    const result = await mesh.publish(event);

    expect(result).toMatchObject({ ok: true, transport: "nats" });
    expect(rpc).toHaveBeenCalledWith("publish_event_mesh_event", expect.any(Object));
    expect(publish).toHaveBeenCalledWith("aios.events.system.system.health.changed", expect.any(Uint8Array), expect.any(Object));
  });
});
