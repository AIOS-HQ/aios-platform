import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  messages: [] as Record<string, unknown>[],
  approvals: [] as Record<string, unknown>[],
  activities: [] as Record<string, unknown>[],
  remembered: [] as Record<string, unknown>[],
  learned: [] as Record<string, unknown>[],
  consultations: [] as Record<string, unknown>[],
}));

function row(table: string, payload: Record<string, unknown>) {
  return {
    id: `${table}-${state.messages.length + state.approvals.length + 1}`,
    created_at: "2026-07-12T00:00:00.000Z",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...payload,
  };
}

function tableBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let selected = false;
  return {
    insert(payload: Record<string, unknown>) {
      const created = row(table, payload);
      if (table === "agent_messages") state.messages.push(created);
      if (table === "approvals") state.approvals.push(created);
      return {
        select: () => ({
          maybeSingle: async () => ({ data: created, error: null }),
        }),
      };
    },
    select() {
      selected = true;
      return this;
    },
    eq(key: string, value: unknown) {
      filters[key] = value;
      return this;
    },
    maybeSingle: async () => {
      if (table !== "agent_messages" || !selected) return { data: null, error: null };
      const found = state.messages.find((message) =>
        Object.entries(filters).every(([key, value]) => message[key] === value),
      );
      return { data: found ?? null, error: null };
    },
    update(payload: Record<string, unknown>) {
      return {
        eq(key: string, value: unknown) {
          filters[key] = value;
          return this;
        },
        then(resolve: (value: { error: null }) => void) {
          const target = state.messages.find((message) =>
            Object.entries(filters).every(([key, value]) => message[key] === value),
          );
          if (target) Object.assign(target, payload);
          resolve({ error: null });
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => tableBuilder(table),
  }),
}));

vi.mock("@/lib/company-skills/utilization", () => ({
  appendSkillContext: (body: string | undefined) => body,
  consultCompanySkills: vi.fn(async () => ({ skills: [{ id: "skill-1", title: "Useful pattern" }] })),
  recordSkillConsultation: vi.fn(async (payload) => {
    state.consultations.push(payload);
  }),
}));

vi.mock("@/lib/harmony/os/events", () => ({
  emitActivity: vi.fn(async (payload) => {
    state.activities.push(payload);
  }),
}));

vi.mock("@/lib/julius/wiring", () => ({
  juliusRecall: vi.fn(async () => [{ id: "julius-1", title: "Known context", kind: "knowledge" }]),
  juliusRemember: vi.fn(async (payload) => {
    state.remembered.push(payload);
    return true;
  }),
}));

vi.mock("@/lib/organizational-intelligence/engine", () => ({
  appendOrganizationalContext: (body: string | undefined) => body,
  buildOrganizationalIntelligence: vi.fn(async () => ({
    strongestCollaboration: null,
    bottlenecks: [],
    planningContext: [],
  })),
}));

vi.mock("@/lib/harmony/adaptive-planning", () => ({
  appendAdaptivePlan: (body: string | undefined) => body,
  buildAdaptiveExecutionPlan: vi.fn(async () => null),
}));

vi.mock("@/lib/company-skills/library", () => ({
  learnCompanySkill: vi.fn(async (payload) => {
    state.learned.push(payload);
    return { id: "skill-learned" };
  }),
}));

describe("A2A workforce certification", () => {
  beforeEach(() => {
    state.messages = [];
    state.approvals = [];
    state.activities = [];
    state.remembered = [];
    state.learned = [];
    state.consultations = [];
  });

  it("delegates routine work with company scope, context, skills, and activity", async () => {
    const { delegateTask } = await import("@/lib/harmony/agents/a2a");
    const message = await delegateTask({
      userId: "user-1",
      companyId: "company-a",
      fromAgent: "harmony",
      toAgent: "auditor",
      subject: "Inspect integration health",
      body: "Check current blockers.",
      risk: "routine",
    });

    expect(message).toMatchObject({
      company_id: "company-a",
      from_agent: "harmony",
      to_agent: "auditor",
      kind: "task",
      status: "delegated",
    });
    expect(state.approvals).toEqual([]);
    expect(state.activities).toHaveLength(1);
    expect(state.consultations).toHaveLength(1);
    expect((message?.context as { julius?: unknown[] }).julius).toHaveLength(1);
  });

  it("rejects unknown agents without writing messages", async () => {
    const { delegateTask } = await import("@/lib/harmony/agents/a2a");
    const message = await delegateTask({
      userId: "user-1",
      companyId: "company-a",
      fromAgent: "harmony",
      toAgent: "nexus",
      subject: "Use reserved AirBid agent",
    });

    expect(message).toBeNull();
    expect(state.messages).toEqual([]);
  });

  it("routes approval and destructive risk through approvals", async () => {
    const { delegateTask } = await import("@/lib/harmony/agents/a2a");

    const approval = await delegateTask({
      userId: "user-1",
      companyId: "company-a",
      fromAgent: "harmony",
      toAgent: "mason",
      subject: "Prepare code change",
      risk: "approval",
    });
    const destructive = await delegateTask({
      userId: "user-1",
      companyId: "company-a",
      fromAgent: "harmony",
      toAgent: "mason",
      subject: "Dangerous engineering request",
      risk: "destructive",
    });

    expect(approval?.status).toBe("awaiting_approval");
    expect(destructive?.status).toBe("awaiting_approval");
    expect(state.approvals).toHaveLength(2);
    expect(state.approvals.map((item) => item.risk)).toEqual(["medium", "high"]);
  });

  it("specialist response closes the parent, records Julius outcome, learns a skill, and emits activity", async () => {
    const { delegateTask, respondToTask } = await import("@/lib/harmony/agents/a2a");
    const parent = await delegateTask({
      userId: "user-1",
      companyId: "company-a",
      fromAgent: "harmony",
      toAgent: "atlas",
      subject: "Curate launch notes",
      risk: "routine",
    });

    const response = await respondToTask({
      userId: "user-1",
      companyId: "company-a",
      parentId: parent!.id,
      fromAgent: "atlas",
      outcome: "Launch notes curated and linked.",
    });

    expect(response).toMatchObject({ kind: "response", status: "completed", parent_id: parent!.id });
    expect(state.messages.find((message) => message.id === parent!.id)?.status).toBe("completed");
    expect(state.remembered).toHaveLength(2);
    expect(state.learned).toHaveLength(1);
    expect(state.activities.some((activity) => String(activity.summary).includes("completed"))).toBe(true);
  });
});
