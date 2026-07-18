import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  companyId: "co-live",
  userId: "founder-1",
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: state.userId })) }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId: vi.fn(async () => state.companyId) }));
vi.mock("@/lib/workforce/registry", () => ({ getAiosAgent: vi.fn((agent: string) => ({ key: agent })) }));
vi.mock("@/lib/workforce/mason-approval", () => ({
  masonFounderApproved: vi.fn((value: FormDataEntryValue | null) => value === "on" || value === "true" || value === "approved"),
}));
vi.mock("@/lib/limits", () => ({ LIMITS: { noteContent: 5000 }, exceedsLimits: vi.fn(() => false) }));

const masonMock = vi.fn();
const recordMock = vi.fn(async () => true);

vi.mock("@/lib/workforce/mason-action", () => ({ handleMasonEngineeringMessage: (...args: unknown[]) => masonMock(...args) }));
vi.mock("@/lib/workforce/chat", () => ({
  recordAgentChatExchange: (...args: unknown[]) => recordMock(...args),
  sendAgentChat: vi.fn(async () => true),
}));

describe("Mason chat approval + resume lifecycle", () => {
  beforeEach(() => {
    masonMock.mockReset();
    recordMock.mockClear();
  });

  it("returns error state for approval-required Mason response so UI surfaces non-terminal block", async () => {
    masonMock.mockResolvedValueOnce({ status: "blocked", summary: "Founder approval required before execution." });

    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");
    const fd = new FormData();
    fd.set("agent", "mason");
    fd.set("message", "Implement a risky change");

    const result = await sendAgentChatAction({ status: "idle", message: "" }, fd);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Founder approval required");
    expect(masonMock.mock.calls[0]?.[0]).toMatchObject({
      userId: state.userId,
      companyId: state.companyId,
      founderApproved: false,
    });
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("resumes approved execution and returns success for follow-up continuity", async () => {
    masonMock
      .mockResolvedValueOnce({ status: "blocked", summary: "Founder approval required before execution." })
      .mockResolvedValueOnce({ status: "completed", summary: "Execution completed after approval." });

    const { sendAgentChatAction } = await import("@/lib/workforce/chat-actions");

    const blocked = new FormData();
    blocked.set("agent", "mason");
    blocked.set("message", "Run change");
    const blockedResult = await sendAgentChatAction({ status: "idle", message: "" }, blocked);
    expect(blockedResult.status).toBe("error");

    const approved = new FormData();
    approved.set("agent", "mason");
    approved.set("message", "Run change");
    approved.set("founder_approved", "on");
    const resumedResult = await sendAgentChatAction({ status: "idle", message: "" }, approved);

    expect(resumedResult.status).toBe("success");
    expect(resumedResult.message).toBe("");
    expect(masonMock.mock.calls[1]?.[0]).toMatchObject({
      userId: state.userId,
      companyId: state.companyId,
      founderApproved: true,
    });
    expect(recordMock).toHaveBeenCalledTimes(2);
  });
});
