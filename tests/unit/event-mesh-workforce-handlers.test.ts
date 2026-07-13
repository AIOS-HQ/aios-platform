import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  message: {
    id: "message-1",
    user_id: "user-1",
    company_id: "company-1",
    from_agent: "harmony",
    to_agent: "auditor",
    kind: "task",
    status: "delegated",
    risk: "routine",
    parent_id: null,
    subject: "Inspect readiness",
    body: "",
    context: {},
    outcome: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
  } as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  responses: [] as Record<string, unknown>[],
  activities: [] as Record<string, unknown>[],
}));

function query() {
  return {
    select: () => query(),
    eq: () => query(),
    in: () => query(),
    update(payload: Record<string, unknown>) {
      state.updates.push(payload);
      return query();
    },
    maybeSingle: async () => ({ data: state.message, error: null }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => query() }),
}));

vi.mock("@/lib/harmony/os/events", () => ({
  emitActivity: vi.fn(async (payload) => state.activities.push(payload)),
}));

vi.mock("@/lib/harmony/agents/a2a", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/harmony/agents/a2a")>();
  return {
    ...original,
    respondToTask: vi.fn(async (payload) => {
      state.responses.push(payload);
      return null;
    }),
  };
});

describe("Event Mesh workforce handlers", () => {
  beforeEach(() => {
    state.message.status = "delegated";
    state.message.to_agent = "auditor";
    state.updates = [];
    state.responses = [];
    state.activities = [];
    delete process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION;
  });

  function delivery() {
    return {
      deliveryId: "delivery-1",
      consumerName: "consumer",
      receivedAt: "2026-07-13T00:00:00.000Z",
      attempt: 1,
      event: {
        eventId: "event-1",
        eventType: "workforce.task.created" as const,
        eventVersion: 1 as const,
        occurredAt: "2026-07-13T00:00:00.000Z",
        publishedAt: "2026-07-13T00:00:00.000Z",
        companyId: "company-1",
        userId: "user-1",
        actor: { type: "agent" as const, id: "harmony" },
        sourceAgent: "harmony",
        targetAgent: "auditor",
        audience: [],
        taskRef: { type: "agent_message" as const, id: "message-1" },
        objectiveId: null,
        approvalId: null,
        risk: "routine" as const,
        category: null,
        priority: "normal" as const,
        traceId: "trace",
        correlationId: "corr",
        causationId: null,
        idempotencyKey: "idem",
        attempt: 0,
        maximumAttempts: 5,
        scheduledFor: null,
        payload: {},
        context: {},
        attachmentRefs: [],
        contentType: "application/vnd.aios.event+json" as const,
      },
      acknowledge: vi.fn(async () => ({ ok: true, action: "ack" as const })),
      negativeAcknowledge: vi.fn(async () => ({ ok: true, action: "retry" as const })),
      deadLetter: vi.fn(async () => ({ ok: true, action: "dead_letter" as const })),
    };
  }

  it("delivers routine tasks in shadow mode without completing them", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();

    await handleWorkforceTaskCreated(d);

    expect(state.updates).toContainEqual({ status: "in_progress" });
    expect(state.responses).toEqual([]);
    expect(state.activities).toHaveLength(1);
    expect(d.acknowledge).toHaveBeenCalled();
  });

  it("dead-letters company scope mismatches", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.companyId = "company-2";

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("company_scope_mismatch");
  });

  it("acks approval-gated tasks until approval resolution", async () => {
    state.message.status = "awaiting_approval";
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();

    await handleWorkforceTaskCreated(d);

    expect(d.acknowledge).toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });
});
