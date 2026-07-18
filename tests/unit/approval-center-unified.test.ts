import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const createClientMock = vi.fn(async () => ({ from: fromMock }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe("Approval Center unified contract", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns legacy and spine approvals in one collection", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "approvals") {
        return {
          select: () => Promise.resolve({
            data: [
              {
                id: "legacy-1",
                company_id: "company-1",
                status: "pending",
                title: "Legacy approval",
                summary: "legacy",
                risk: "high",
                type: "work_item",
                created_at: "2026-07-18T10:00:00Z",
                decided_at: null,
                department_id: null,
                work_item_id: null,
                message_id: null,
                agent_message_id: null,
              },
            ],
            error: null,
          }),
        };
      }

      if (table === "approval_payloads") {
        return {
          select: () => Promise.resolve({
            data: [
              {
                id: "spine-1",
                approval_id: "approval_123",
                company_id: "company-1",
                status: "pending",
                original_agent: "mason",
                original_action: "open_pull_request",
                original_params: { repository: "AIOS-HQ/aios-platform", branch: "feature/a" },
                required_context: { execution_id: "exec-1", correlation_id: "corr-1" },
                rejection_reason: null,
                created_at: "2026-07-18T11:00:00Z",
                founder_approved_at: null,
                expires_at: null,
              },
            ],
            error: null,
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    });

    const { listApprovalsUnified } = await import("@/lib/data/os/approvals");
    const rows = await listApprovalsUnified();
    expect(rows.map((row) => row.id)).toEqual(["spine-1", "legacy-1"]);
    expect(rows.map((row) => row.source)).toEqual(["spine", "legacy"]);
    expect(rows.find((row) => row.id === "legacy-1")?.expires_at).toBeNull();
    expect(rows.find((row) => row.id === "spine-1")?.original_params).toMatchObject({ repository: "AIOS-HQ/aios-platform" });
  });

  it("applies company filter to both stores", async () => {
    const legacyEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const spineEq = vi.fn().mockResolvedValue({ data: [], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "approvals") {
        return {
          select: () => ({ eq: legacyEq }),
        };
      }
      if (table === "approval_payloads") {
        return {
          select: () => ({ eq: spineEq }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { listApprovalsUnified } = await import("@/lib/data/os/approvals");
    await listApprovalsUnified({ companyId: "company-42" });

    expect(legacyEq).toHaveBeenCalledWith("company_id", "company-42");
    expect(spineEq).toHaveBeenCalledWith("company_id", "company-42");
  });

  it("surfaces database errors instead of silently returning zero", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "approvals") {
        return {
          select: () => Promise.resolve({ data: null, error: { message: "legacy_rls_denied" } }),
        };
      }
      if (table === "approval_payloads") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { listApprovalsUnified } = await import("@/lib/data/os/approvals");
    await expect(listApprovalsUnified()).rejects.toThrow("legacy_rls_denied");
  });
});
