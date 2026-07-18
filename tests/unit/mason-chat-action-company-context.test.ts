import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  companyId: "co-live",
  message: "Ship a safe fix",
  userId: "founder-1",
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: state.userId })) }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId: vi.fn(async () => state.companyId) }));
vi.mock("@/lib/workforce/registry", () => ({ getAiosAgent: vi.fn(() => ({ key: "mason" })) }));
vi.mock("@/lib/workforce/mason-approval", () => ({ masonFounderApproved: vi.fn(() => true) }));
vi.mock("@/lib/limits", () => ({ LIMITS: { noteContent: 5000 }, exceedsLimits: vi.fn(() => false) }));

const masonMock = vi.fn(async () => ({ status: "completed", summary: "ok" }));
const recordMock = vi.fn(async () => true);
const sendMock = vi.fn(async () => true);

vi.mock("@/lib/workforce/mason-action", () => ({ handleMasonEngineeringMessage: (...args: unknown[]) => masonMock(...args) }));
vi.mock("@/lib/workforce/chat", () => ({
  recordAgentChatExchange: (...args: unknown[]) => recordMock(...args),
  sendAgentChat: (...args: unknown[]) => sendMock(...args),
}));

describe("sendAgentChatAction Mason company context", () => {
  beforeEach(() => {
    masonMock.mockClear();
    recordMock.mockClear();
    sendMock.mockClear();
  });

  it("passes resolved company context into Mason runtime entrypoint", async () => {
    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");

    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", state.message);

    const result = await sendAgentChatAction({ status: "idle", message: "" }, fd);

    expect(result.status).toBe("success");
    expect(masonMock).toHaveBeenCalledTimes(1);
    expect(masonMock.mock.calls[0][0]).toMatchObject({
      userId: state.userId,
      companyId: state.companyId,
      message: state.message,
    });
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
