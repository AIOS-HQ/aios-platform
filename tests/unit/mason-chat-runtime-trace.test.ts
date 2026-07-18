import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  userId: "founder-1",
  companyId: "company-1",
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
    createMasonChatCorrelationId: vi.fn(() => "corr-trace"),
    logMasonChatPhase: vi.fn(async (phase: string, context: Record<string, unknown>, extras?: Record<string, unknown>) => {
      phaseCalls.push({ phase, context, extras });
    }),
    logMasonChatFailure: vi.fn(async (phase: string, context: Record<string, unknown>, error: unknown) => {
      failureCalls.push({ phase, context, error });
    }),
  };
});

describe("Mason chat live runtime trace", () => {
  beforeEach(() => {
    phaseCalls.length = 0;
    failureCalls.length = 0;
    masonMock.mockReset();
    recordMock.mockClear();
  });

  async function submit(message: string) {
    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");
    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", message);
    return sendAgentChatAction({ status: "idle", message: "" }, fd);
  }

  it("read-only guard true selects conversational path and does not call engineering handler", async () => {
    const result = await submit("Respond only with runtime status. Do not execute tools.");
    expect(result.status).toBe("success");
    expect(masonMock).not.toHaveBeenCalled();

    const phases = phaseCalls.map((entry) => entry.phase);
    expect(phases).toContain("mason_chat_server_entered");
    expect(phases).toContain("mason_chat_readonly_guard_evaluated");
    expect(phases).toContain("mason_chat_intent_classified");
    expect(phases).toContain("mason_chat_path_selected");
    expect(phases).toContain("mason_chat_response_returned");
    expect(phases).not.toContain("mason_chat_engineering_handler_called");

    const guard = phaseCalls.find((entry) => entry.phase === "mason_chat_readonly_guard_evaluated");
    expect(guard?.context.readonlyGuardResult).toBe(true);

    const selected = phaseCalls.find((entry) => entry.phase === "mason_chat_path_selected");
    expect(selected?.context.selectedPath).toBe("conversation");
  });

  it("read-only guard false selects execution path and traces engineering/runtime/approval", async () => {
    masonMock.mockResolvedValueOnce({
      status: "blocked",
      summary: "awaiting approval",
      diagnostics: { retrievalExecutionId: "exec-123" },
    });

    const result = await submit("Create a branch and open a PR");
    expect(result.status).toBe("error");
    expect(masonMock).toHaveBeenCalledTimes(1);

    const phases = phaseCalls.map((entry) => entry.phase);
    expect(phases).toContain("mason_chat_engineering_handler_called");
    expect(phases).toContain("mason_chat_runtime_called");
    expect(phases).toContain("mason_chat_approval_result_received");

    const selected = phaseCalls.find((entry) => entry.phase === "mason_chat_path_selected");
    expect(selected?.context.selectedPath).toBe("engineering_execution");

    const approval = phaseCalls.find((entry) => entry.phase === "mason_chat_approval_result_received");
    expect(approval?.context.approvalId).toBeNull();
  });

  it("reuses one correlation id and never logs message content", async () => {
    masonMock.mockResolvedValueOnce({ status: "completed", summary: "ok", diagnostics: {} });
    await submit("SECRET_MESSAGE_TEXT must never appear");

    const ids = new Set(phaseCalls.map((entry) => entry.context.correlationId));
    expect(ids.size).toBe(1);
    expect(Array.from(ids)[0]).toBe("corr-trace");

    const serialized = JSON.stringify(phaseCalls);
    expect(serialized.includes("SECRET_MESSAGE_TEXT")).toBe(false);
  });

  it("preserves original behavior by rethrowing failures", async () => {
    masonMock.mockRejectedValueOnce(new Error("runtime exploded"));
    await expect(submit("Create a branch and open a PR")).rejects.toThrow("runtime exploded");
    expect(failureCalls).toHaveLength(1);
  });
});
