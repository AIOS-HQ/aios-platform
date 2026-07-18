import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  userId: "founder-1",
  companyId: "company-1",
  message: "Run Mason objective",
};

const phaseCalls: Array<{ phase: string; context: Record<string, unknown>; extras?: Record<string, unknown> }> = [];
const failureCalls: Array<{ phase: string; context: Record<string, unknown>; error: unknown }> = [];

const masonMock = vi.fn();
const recordMock = vi.fn(async () => true);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: state.userId })) }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId: vi.fn(async () => state.companyId) }));
vi.mock("@/lib/workforce/registry", () => ({ getAiosAgent: vi.fn((agent: string) => ({ key: agent })) }));
vi.mock("@/lib/workforce/mason-approval", () => ({ masonFounderApproved: vi.fn(() => false) }));
vi.mock("@/lib/limits", () => ({ LIMITS: { noteContent: 5000 }, exceedsLimits: vi.fn(() => false) }));

vi.mock("@/lib/workforce/mason-action", () => ({ handleMasonEngineeringMessage: (...args: unknown[]) => masonMock(...args) }));
vi.mock("@/lib/workforce/chat", () => ({
  recordAgentChatExchange: (...args: unknown[]) => recordMock(...args),
  sendAgentChat: vi.fn(async () => true),
}));
vi.mock("@/lib/workforce/chat-diagnostics", async () => {
  const real = await vi.importActual<typeof import("@/lib/workforce/chat-diagnostics")>("@/lib/workforce/chat-diagnostics");
  return {
    ...real,
    createMasonChatCorrelationId: vi.fn(() => "corr-fixed"),
    logMasonChatPhase: vi.fn(async (phase: string, context: Record<string, unknown>, extras?: Record<string, unknown>) => {
      phaseCalls.push({ phase, context, extras });
    }),
    logMasonChatFailure: vi.fn(async (phase: string, context: Record<string, unknown>, error: unknown) => {
      failureCalls.push({ phase, context, error });
    }),
  };
});

describe("Mason chat diagnostics instrumentation", () => {
  beforeEach(() => {
    phaseCalls.length = 0;
    failureCalls.length = 0;
    masonMock.mockReset();
    recordMock.mockClear();
  });

  it("uses one correlation id and emits ordered phases on success path", async () => {
    masonMock.mockResolvedValueOnce({
      status: "completed",
      summary: "ok",
      diagnostics: { executionId: "exec-1", retrievalStatus: "found" },
    });

    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");
    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", state.message);

    const result = await sendAgentChatAction({ status: "idle", message: "" }, fd);
    expect(result.status).toBe("success");

    const phases = phaseCalls.map((item) => item.phase);
    expect(phases).toContain("mason_chat_server_entered");
    expect(phases).toContain("mason_chat_agent_resolved");
    expect(phases).toContain("mason_chat_company_resolved");
    expect(phases).toContain("mason_chat_engineering_handler_called");
    expect(phases).toContain("mason_chat_runtime_called");
    expect(phases).toContain("mason_chat_response_returned");

    const ids = new Set(phaseCalls.map((entry) => entry.context.correlationId));
    expect(ids.size).toBe(1);
    expect(Array.from(ids)[0]).toBe("corr-fixed");
  });

  it("logs failed phase and propagates original error", async () => {
    const failure = new Error("ledger exploded");
    masonMock.mockRejectedValueOnce(failure);

    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");
    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", state.message);

    await expect(sendAgentChatAction({ status: "idle", message: "" }, fd)).rejects.toThrow("ledger exploded");

    expect(failureCalls).toHaveLength(1);
    expect(failureCalls[0]?.phase).toBe("mason_chat_company_resolved");
    expect(failureCalls[0]?.context.correlationId).toBe("corr-fixed");
  });

  it("never logs message body content in diagnostic payload", async () => {
    masonMock.mockResolvedValueOnce({ status: "completed", summary: "done", diagnostics: {} });

    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");
    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", "SECRET_TEST_MESSAGE_CONTENT");

    await sendAgentChatAction({ status: "idle", message: "" }, fd);

    const serialized = JSON.stringify(phaseCalls);
    expect(serialized.includes("SECRET_TEST_MESSAGE_CONTENT")).toBe(false);
  });
});
