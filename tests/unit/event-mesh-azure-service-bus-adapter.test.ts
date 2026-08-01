import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiosEventEnvelope } from "@/lib/event-mesh/types";
import { createAiosEventEnvelope } from "@/lib/event-mesh/envelope";

const createMessageBatchMock = vi.fn();
const sendMessagesMock = vi.fn();
const closeSenderMock = vi.fn();
const createSenderMock = vi.fn();

const completeMessageMock = vi.fn();
const abandonMessageMock = vi.fn();
const deadLetterMessageMock = vi.fn();
const closeReceiverMock = vi.fn();
const receiverSubscribeMock = vi.fn();
const createReceiverMock = vi.fn();

const subscriptionExistsMock = vi.fn();
const createSubscriptionMock = vi.fn();
const getTopicMock = vi.fn();
const closeClientMock = vi.fn();

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock("@azure/service-bus", () => {
  class ServiceBusClient {
    createSender = createSenderMock;
    createReceiver = createReceiverMock;
    close = closeClientMock;
  }

  class ServiceBusAdministrationClient {
    subscriptionExists = subscriptionExistsMock;
    createSubscription = createSubscriptionMock;
    getTopic = getTopicMock;
  }

  return {
    ServiceBusClient,
    ServiceBusAdministrationClient,
  };
});

function makeEnvelope(overrides: Partial<AiosEventEnvelope> = {}): AiosEventEnvelope {
  return createAiosEventEnvelope({
    eventType: "workforce.task.created",
    companyId: "company-1",
    sourceAgent: "mason",
    targetAgent: "julius",
    payload: { task: "run" },
    context: { env: "test" },
    ...overrides,
  });
}

function makeConfig() {
  return {
    workerId: "runtime-r1",
    azureServiceBus: {
      namespace: "aios-test-namespace",
      topicName: "event-mesh",
      replayTopicName: "event-mesh-replay",
      subscriptionPrefix: "runtime",
      replaySubscriptionPrefix: "runtime-replay",
      disableReplay: false,
    },
  } as const;
}

describe("AzureServiceBusEventMesh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    const batch = {
      tryAddMessage: vi.fn(() => true),
    };

    createMessageBatchMock.mockResolvedValue(batch);
    sendMessagesMock.mockResolvedValue(undefined);
    closeSenderMock.mockResolvedValue(undefined);
    createSenderMock.mockReturnValue({
      createMessageBatch: createMessageBatchMock,
      sendMessages: sendMessagesMock,
      close: closeSenderMock,
    });

    completeMessageMock.mockResolvedValue(undefined);
    abandonMessageMock.mockResolvedValue(undefined);
    deadLetterMessageMock.mockResolvedValue(undefined);
    closeReceiverMock.mockResolvedValue(undefined);
    receiverSubscribeMock.mockImplementation((handlers: { processMessage: (message: unknown) => Promise<void> }) => {
      (globalThis as { __azureProcessMessage?: (message: unknown) => Promise<void> }).__azureProcessMessage = handlers.processMessage;
      return {
        close: vi.fn().mockResolvedValue(undefined),
      };
    });
    createReceiverMock.mockReturnValue({
      subscribe: receiverSubscribeMock,
      completeMessage: completeMessageMock,
      abandonMessage: abandonMessageMock,
      deadLetterMessage: deadLetterMessageMock,
      close: closeReceiverMock,
    });

    subscriptionExistsMock.mockResolvedValue(true);
    createSubscriptionMock.mockResolvedValue(undefined);
    getTopicMock.mockResolvedValue({ status: "Active" });
    closeClientMock.mockResolvedValue(undefined);
  });

  it("publishes valid envelopes through Azure Service Bus", async () => {
    const { AzureServiceBusEventMesh } = await import("@/lib/event-mesh/adapters/azure-service-bus");
    const adapter = new AzureServiceBusEventMesh(makeConfig());
    const event = makeEnvelope();

    const result = await adapter.publish(event);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("published");
    expect(createSenderMock).toHaveBeenCalledWith("event-mesh");
    expect(createMessageBatchMock).toHaveBeenCalledTimes(1);
    expect(sendMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("registers a consumer and supports ack/retry/dead-letter", async () => {
    const { AzureServiceBusEventMesh } = await import("@/lib/event-mesh/adapters/azure-service-bus");
    const adapter = new AzureServiceBusEventMesh(makeConfig());

    const okConsumer = {
      consumerName: "worker-ok",
      eventTypes: ["workforce.task.created" as const],
      handler: vi.fn(async (delivery: { acknowledge: () => Promise<unknown> }) => {
        await delivery.acknowledge();
      }),
    };

    await adapter.registerConsumer(okConsumer);

    const processMessage = (globalThis as { __azureProcessMessage?: (message: unknown) => Promise<void> }).__azureProcessMessage;
    expect(processMessage).toBeTypeOf("function");

    const envelope = makeEnvelope();

    await processMessage!({ body: JSON.stringify(envelope), messageId: envelope.eventId, deliveryCount: 1 });
    expect(completeMessageMock).toHaveBeenCalledTimes(1);

    okConsumer.handler.mockImplementationOnce(async (delivery: { negativeAcknowledge: (reason: string, opts?: { retry?: boolean }) => Promise<unknown> }) => {
      await delivery.negativeAcknowledge("retryable", { retry: true });
    });
    await processMessage!({ body: Buffer.from(JSON.stringify(envelope), "utf8"), messageId: envelope.eventId, deliveryCount: 2 });
    expect(abandonMessageMock).toHaveBeenCalledTimes(1);

    okConsumer.handler.mockImplementationOnce(async (delivery: { deadLetter: (reason: string) => Promise<unknown> }) => {
      await delivery.deadLetter("bad");
    });
    await processMessage!({ body: new TextEncoder().encode(JSON.stringify(envelope)), messageId: envelope.eventId, deliveryCount: 3 });
    expect(deadLetterMessageMock).toHaveBeenCalledTimes(1);
  });

  it("reports degraded health on admin failure", async () => {
    const { AzureServiceBusEventMesh } = await import("@/lib/event-mesh/adapters/azure-service-bus");
    getTopicMock.mockRejectedValueOnce(new Error("admin_down"));
    const adapter = new AzureServiceBusEventMesh(makeConfig());

    const health = await adapter.health();

    expect(health.ok).toBe(false);
    expect(health.status).toBe("degraded");
    expect(String(health.details.error)).toContain("admin_down");
  });

  it("fails replay when replay topic is disabled", async () => {
    const { AzureServiceBusEventMesh } = await import("@/lib/event-mesh/adapters/azure-service-bus");
    const config = {
      ...makeConfig(),
      azureServiceBus: {
        ...makeConfig().azureServiceBus,
        disableReplay: true,
      },
    } as const;

    const adapter = new AzureServiceBusEventMesh(config);
    const replay = await adapter.replay("company-1");

    expect(replay.ok).toBe(false);
    expect(replay.status).toBe("failed");
    expect(replay.error).toContain("replay_not_supported_without_replay_topic");
  });

  it("closes sender and client on shutdown", async () => {
    const { AzureServiceBusEventMesh } = await import("@/lib/event-mesh/adapters/azure-service-bus");
    const adapter = new AzureServiceBusEventMesh(makeConfig());

    await adapter.shutdown();

    expect(closeSenderMock).toHaveBeenCalledTimes(1);
    expect(closeClientMock).toHaveBeenCalledTimes(1);
  });
});
