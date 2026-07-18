import { describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: fromMock })),
}));

describe("approval consistency contract", () => {
  it("countPendingApprovals uses unified visible pending rows", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "approvals") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: "a1", company_id: "c1", status: "pending" }], error: null }),
          }),
        };
      }
      if (table === "approval_payloads") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: "p1", company_id: "c1", status: "pending" }], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { countPendingApprovals, listPendingApprovalsUnified } = await import("@/lib/data/os/approvals");
    await expect(countPendingApprovals()).resolves.toBe(2);
    await expect(listPendingApprovalsUnified()).resolves.toEqual([
      { id: "a1", company_id: "c1", status: "pending", source: "legacy" },
      { id: "p1", company_id: "c1", status: "pending", source: "spine" },
    ]);
  });

  it("company-scoped filter applies to both legacy and spine pending stores", async () => {
    const legacyEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const spineEq = vi.fn().mockResolvedValue({ data: [], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === "approvals") {
        return {
          select: () => ({
            eq: vi.fn((col: string, val: string) => {
              if (col === "status") return { eq: legacyEq };
              throw new Error(`unexpected legacy eq ${col}=${val}`);
            }),
          }),
        };
      }
      if (table === "approval_payloads") {
        return {
          select: () => ({
            eq: vi.fn((col: string, val: string) => {
              if (col === "status") return { eq: spineEq };
              throw new Error(`unexpected spine eq ${col}=${val}`);
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const { listPendingApprovalsUnified } = await import("@/lib/data/os/approvals");
    await listPendingApprovalsUnified({ companyId: "company-42" });

    expect(legacyEq).toHaveBeenCalledWith("company_id", "company-42");
    expect(spineEq).toHaveBeenCalledWith("company_id", "company-42");
  });
});

