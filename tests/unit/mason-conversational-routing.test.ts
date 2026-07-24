import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  userId: "founder-1",
  companyId: "company-1",
};

const masonMock = vi.fn();
const recordMock = vi.fn(async () => true);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: state.userId })) }));
vi.mock("@/lib/auth/roles", () => ({ currentUserIsAdmin: vi.fn(async () => true) }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId: vi.fn(async () => state.companyId) }));
vi.mock("@/lib/workforce/registry", () => ({ getAiosAgent: vi.fn((agent: string) => ({ key: agent })) }));
vi.mock("@/lib/workforce/mason-action", () => ({ handleMasonEngineeringMessage: (...args: unknown[]) => masonMock(...args) }));
vi.mock("@/lib/workforce/chat", () => ({
  recordAgentChatExchange: (...args: unknown[]) => recordMock(...args),
  sendAgentChat: vi.fn(async () => true),
}));
vi.mock("@/lib/workforce/mason-approval", () => ({ masonFounderApproved: vi.fn(() => false) }));
vi.mock("@/lib/limits", () => ({ LIMITS: { noteContent: 5000 }, exceedsLimits: vi.fn(() => false) }));
vi.mock("@/lib/workforce/chat-diagnostics", async () => {
  const real = await vi.importActual<typeof import("@/lib/workforce/chat-diagnostics")>("@/lib/workforce/chat-diagnostics");
  return {
    ...real,
    createMasonChatCorrelationId: vi.fn(() => "corr-routing"),
    logMasonChatPhase: vi.fn(async () => {}),
    logMasonChatFailure: vi.fn(async () => {}),
  };
});

describe("Mason conversational routing", () => {
  beforeEach(() => {
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

  it("routes read-only runtime verification as conversation with no approval runtime call", async () => {
    const result = await submit("Production verification test. Do not execute tools.");
    expect(result.status).toBe("success");
    expect(masonMock).not.toHaveBeenCalled();
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
      assistantMessage: "Mason runtime operational.",
      refs: expect.objectContaining({ conversation_mode: "read_only" }),
    });
  });

  it("routes explain runtime health read-only as conversation", async () => {
    const result = await submit("Explain runtime health read-only. Do not execute anything.");
    expect(result.status).toBe("success");
    expect(masonMock).not.toHaveBeenCalled();
  });

  it("keeps mutation requests in governed execution path", async () => {
    masonMock.mockResolvedValueOnce({ status: "blocked", summary: "approval required", diagnostics: {} });
    const result = await submit("Create a branch and open a PR");
    expect(masonMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("error");
  });

  it("keeps explicit deploy intent in governed execution path", async () => {
    masonMock.mockResolvedValueOnce({ status: "blocked", summary: "approval required", diagnostics: {} });
    const result = await submit("Deploy to production");
    expect(masonMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("error");
  });
});
