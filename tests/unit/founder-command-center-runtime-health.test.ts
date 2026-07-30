import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const currentUserIsAdmin = vi.fn();
const resolvePrimaryCompanyId = vi.fn();
const getEnvelope = vi.fn();
const buildDigitalTwin = vi.fn();
const getCompanyFinancialSnapshot = vi.fn();
const getRuntimeHealthSummary = vi.fn();
const getRuntimeHealthMetadata = vi.fn();

vi.mock("@/lib/auth/user", () => ({ requireUser }));
vi.mock("@/lib/auth/roles", () => ({ currentUserIsAdmin }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId }));
vi.mock("@/lib/company/envelope", () => ({ getEnvelope }));
vi.mock("@/lib/company/digital-twin", () => ({ buildDigitalTwin }));
vi.mock("@/lib/ledger", () => ({ getCompanyFinancialSnapshot }));
vi.mock("@/lib/runtime/health-api", () => ({
  internalRuntimeHealthApi: {
    getRuntimeHealthSummary,
    getRuntimeHealthMetadata,
  },
}));

describe("founder command center runtime health integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    requireUser.mockResolvedValue({ id: "user-1" });
    currentUserIsAdmin.mockResolvedValue(true);
    resolvePrimaryCompanyId.mockResolvedValue("company-1");

    getEnvelope.mockResolvedValue({ objectives: [] });
    buildDigitalTwin.mockResolvedValue({
      organization: { departments: 0, aiWorkforce: 0, humanWorkforce: 0 },
      connectors: { bound: 0 },
      graph: { nodes: 0, edges: 0 },
      direction: { objectives: 0, priorities: 0 },
      risks: [],
    });
    getCompanyFinancialSnapshot.mockResolvedValue(null);

    getRuntimeHealthSummary.mockResolvedValue({
      scope: { userId: "user-1", companyId: "company-1" },
      generatedAt: "2026-07-30T00:00:00.000Z",
      status: "degraded",
      probes: [],
      categories: [
        { category: "liveness", total: 2, healthy: 1, degraded: 1, failed: 0, unknown: 0, stale: 1, status: "degraded" },
        { category: "readiness", total: 1, healthy: 0, degraded: 0, failed: 0, unknown: 1, stale: 0, status: "unknown" },
      ],
    });
    getRuntimeHealthMetadata.mockReturnValue({
      cacheKey: '["user-1","company-1"]',
      scope: { userId: "user-1", companyId: "company-1" },
      generatedAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T00:00:30.000Z",
      ageMs: 100,
      ttlMs: 30000,
      stale: false,
      present: true,
    });
  });

  it("delegates founder runtime health reads to internal runtime health api with scoped user/company", async () => {
    const { default: ExecutiveDashboardPage } = await import("@/app/(app)/harmony/executive/page");

    await ExecutiveDashboardPage();

    expect(getRuntimeHealthSummary).toHaveBeenCalledWith({ userId: "user-1", companyId: "company-1" });
    expect(getRuntimeHealthMetadata).toHaveBeenCalledWith({ userId: "user-1", companyId: "company-1" });
  });

  it("handles runtime health retrieval failures gracefully without breaking the page", async () => {
    getRuntimeHealthSummary.mockRejectedValueOnce(new Error("runtime failed"));

    const { default: ExecutiveDashboardPage } = await import("@/app/(app)/harmony/executive/page");

    await expect(ExecutiveDashboardPage()).resolves.toBeTruthy();
  });
});
