import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const getCompany = vi.fn();

vi.mock("@/lib/auth/user", () => ({ requireUser }));
vi.mock("@/lib/data/os/companies", () => ({ getCompany }));

describe("runtime probe auth/scope hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects caller impersonation", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    const { authorizeProbeScope, ProbeAuthorizationError } = await import("@/lib/runtime/probes/auth");
    await expect(authorizeProbeScope({ userId: "user-b", companyId: null })).rejects.toBeInstanceOf(ProbeAuthorizationError);
  });

  it("requires owned/accessible company when companyId is present", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    getCompany.mockResolvedValue(null);
    const { authorizeProbeScope, ProbeAuthorizationError } = await import("@/lib/runtime/probes/auth");
    await expect(authorizeProbeScope({ userId: "user-a", companyId: "company-x" })).rejects.toBeInstanceOf(ProbeAuthorizationError);
  });

  it("returns authorized scope when user/company are valid", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    getCompany.mockResolvedValue({ id: "company-a" });
    const { authorizeProbeScope } = await import("@/lib/runtime/probes/auth");
    await expect(authorizeProbeScope({ userId: "user-a", companyId: "company-a" })).resolves.toEqual({ userId: "user-a", companyId: "company-a" });
  });

  it("sanitizes token-like reason/summary/evidence fields", async () => {
    const { sanitizeProbe } = await import("@/lib/runtime/probes/auth");
    const safe = sanitizeProbe({
      probeId: "p",
      source: "diagnostics",
      category: "readiness",
      status: "unknown",
      summary: "contains bearer token",
      observedAt: null,
      freshness: "unknown",
      scope: { userId: "u", companyId: null },
      unavailable: true,
      reason: "authorization failed with token abc",
      recommendedAction: "use secret credential",
      evidence: [{ source: "diagnostics", ref: "token=abc", observedAt: "2026-07-29T00:00:00.000Z" }],
    });

    expect(safe.summary).toBe("Probe produced a restricted summary.");
    expect(safe.reason).toBe("Probe source failed with a restricted error payload.");
    expect(safe.recommendedAction).toBe("Review source diagnostics in authorized tools.");
    expect(safe.evidence[0]?.ref).toBe("[redacted]");
  });
});
