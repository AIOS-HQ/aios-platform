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
    context: {
      envelope: {
        schemaVersion: 1,
        envelopeId: "message-1",
        companyId: "company-1",
        userId: "user-1",
        execution: {
          status: "delegated",
          createdAt: "2026-07-13T00:00:00.000Z",
          delegatedAt: "2026-07-13T00:00:00.000Z",
          acknowledgedAt: null,
          startedAt: null,
          completedAt: null,
          timedOutAt: null,
          deadLetteredAt: null,
          timeoutMs: 300000,
          attempts: 1,
          maxAttempts: 5,
        },
        trace: {
          correlationId: "corr",
          causationId: null,
          parentMessageId: null,
          approvalRequired: false,
          approvalId: null,
        },
        policy: {
          risk: "routine",
          requiresApproval: false,
          companyScopeEnforced: true,
        },
        delivery: {
          ackRequested: true,
          ackReceived: false,
          retryEligible: true,
          timeoutReason: null,
          deadLetterReason: null,
        },
        actor: {
          fromAgent: "harmony",
          toAgent: "auditor",
          kind: "task",
        },
      },
      executionId: "exec-1",
    },
    outcome: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
  } as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  responses: [] as Record<string, unknown>[],
  activities: [] as Record<string, unknown>[],
  connectorCalls: [] as Record<string, unknown>[],
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
    maybeSingle: async () => ({
      data: state.message,
      error: null,
    }),
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

vi.mock("@/lib/integrations/connector-runtime", () => ({
  runConnectorCapability: vi.fn(async (userId, connectorId, capabilityId, params) => {
    state.connectorCalls.push({ userId, connectorId, capabilityId, params });
    return { ok: true, status: "executed", message: "ok", data: { ok: true } };
  }),
}));

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
      causationId: "cause-1",
      idempotencyKey: "idem",
      attempt: 0,
      maximumAttempts: 5,
      scheduledFor: null,
      payload: {},
      context: { executionId: "exec-1" },
      attachmentRefs: [],
      contentType: "application/vnd.aios.event+json" as const,
    },
    acknowledge: vi.fn(async () => ({ ok: true, action: "ack" as const })),
    negativeAcknowledge: vi.fn(async () => ({ ok: true, action: "retry" as const })),
    deadLetter: vi.fn(async () => ({ ok: true, action: "dead_letter" as const })),
  };
}

describe("Event Mesh workforce handlers", () => {
  beforeEach(() => {
    state.message.to_agent = "auditor";
    state.message.from_agent = "harmony";
    state.message.company_id = "company-1";
    state.message.status = "delegated";
    state.message.subject = "Inspect readiness";
    state.message.body = "";
    state.message.context = {
      envelope: {
        schemaVersion: 1,
        envelopeId: "message-1",
        companyId: "company-1",
        userId: "user-1",
        execution: {
          status: "delegated",
          createdAt: "2026-07-13T00:00:00.000Z",
          delegatedAt: "2026-07-13T00:00:00.000Z",
          acknowledgedAt: null,
          startedAt: null,
          completedAt: null,
          timedOutAt: null,
          deadLetteredAt: null,
          timeoutMs: 300000,
          attempts: 1,
          maxAttempts: 5,
        },
        trace: {
          correlationId: "corr",
          causationId: null,
          parentMessageId: null,
          approvalRequired: false,
          approvalId: null,
        },
        policy: {
          risk: "routine",
          requiresApproval: false,
          companyScopeEnforced: true,
        },
        delivery: {
          ackRequested: true,
          ackReceived: false,
          retryEligible: true,
          timeoutReason: null,
          deadLetterReason: null,
        },
        actor: {
          fromAgent: "harmony",
          toAgent: "auditor",
          kind: "task",
        },
      },
      executionId: "exec-1",
    };
    state.updates = [];
    state.responses = [];
    state.activities = [];
    state.connectorCalls = [];
    delete process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION;
  });

  it("returns unsupported_runtime for registered-only workers and never success", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(state.responses[0]?.status).toBe("blocked");
    expect(String(state.responses[0]?.outcome)).toContain("unsupported_runtime:auditor");
    expect(String(state.responses[0]?.outcome)).toContain("execution=exec-1");
    expect(String(state.responses[0]?.outcome)).toContain("correlation=corr");
    expect(String(state.responses[0]?.outcome)).toContain("causation=cause-1");
  });

  it("routes Mason through governed runtime path and preserves trace", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "mason";
    state.message.from_agent = "founder";

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "mason";
    d.event.actor = { type: "founder", id: "founder-1" };

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(state.responses[0]?.status).toBe("blocked");
    expect(String(state.responses[0]?.outcome)).toContain("Event Mesh blocked Mason");
  });

  it("enforces Mason founder-only boundary", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "mason";
    state.message.from_agent = "mason";

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "mason";
    d.event.actor = { type: "agent", id: "harmony" };

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("Founder-only agent work cannot run");
  });


  it("non-founder Mason denial does not expose oauth/dependency details", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "mason";

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "mason";
    d.event.actor = { type: "agent", id: "harmony" };

    await handleWorkforceTaskCreated(d);

    const outcome = String(state.responses[0]?.outcome ?? "");
    expect(outcome).toContain("Founder-only agent work cannot run");
    expect(outcome.toLowerCase()).not.toContain("oauth");
    expect(outcome.toLowerCase()).not.toContain("github");
    expect(outcome.toLowerCase()).not.toContain("credential");
  });

  it("authorized founder Mason request still reaches readiness gate", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "mason";
    state.message.from_agent = "founder";

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "mason";
    d.event.actor = { type: "founder", id: "founder-1" };

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("Event Mesh blocked Mason");
  });

  it("dispatches Ambassador only with valid communication context", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "ambassador";
    state.message.context = {
      ...(state.message.context as Record<string, unknown>),
      conversationId: "conv-1",
      outgoingBody: "Hello there",
    };

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "ambassador";

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("ambassador_dispatch_ready");
  });

  it("blocks Ambassador with invalid payload", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "ambassador";
    state.message.context = state.message.context as Record<string, unknown>;

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "ambassador";

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("ambassador_invalid_payload");
  });

  it("handles Harmony non-recursive work-item payload", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "harmony";
    state.message.context = {
      ...(state.message.context as Record<string, unknown>),
      workItemId: "wi-1",
    };

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "harmony";

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("harmony_work_item_routing");
  });

  it("blocks Harmony invalid payload", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "harmony";

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "harmony";

    await handleWorkforceTaskCreated(d);

    expect(state.responses).toHaveLength(1);
    expect(String(state.responses[0]?.outcome)).toContain("harmony_invalid_payload");
  });

  it("dead-letters unknown recipient", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "unknown-agent";

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("unknown_recipient");
  });

  it("dead-letters wrong recipient", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "mason";

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("wrong_recipient");
  });

  it("dead-letters missing company context", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.companyId = null;

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("workforce_task_missing_reference");
  });

  it("dead-letters cross-company delivery", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.companyId = "company-2";

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("company_scope_mismatch");
  });

  it("dead-letters missing execution id", async () => {
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.context = {};

    await handleWorkforceTaskCreated(d);

    expect(d.deadLetter).toHaveBeenCalledWith("missing_execution_context");
  });

  it("keeps approval-gated tasks acknowledged without executing", async () => {
    state.message.status = "awaiting_approval";
    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();

    await handleWorkforceTaskCreated(d);

    expect(d.acknowledge).toHaveBeenCalled();
    expect(state.responses).toEqual([]);
  });

  it("routes Catalyst through connector adapter only with explicit mapping", async () => {
    process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION = "true";
    state.message.to_agent = "catalyst";
    state.message.context = {
      ...(state.message.context as Record<string, unknown>),
      connectorId: "github",
      capabilityId: "list_repositories",
      connectorParams: {},
    };

    const { handleWorkforceTaskCreated } = await import("@/lib/event-mesh/workforce-handlers");
    const d = delivery();
    d.event.targetAgent = "catalyst";

    await handleWorkforceTaskCreated(d);

    expect(state.connectorCalls).toHaveLength(1);
    expect(state.responses).toHaveLength(1);
    expect(state.responses[0]?.status).toBe("completed");
  });
});
