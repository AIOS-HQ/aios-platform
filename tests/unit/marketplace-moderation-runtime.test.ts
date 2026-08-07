import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockCreateClient,
  mockResolvePrimaryCompanyId,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockCreateClient: vi.fn(),
  mockResolvePrimaryCompanyId: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId: mockResolvePrimaryCompanyId }));

import { moderateMarketplaceItem } from "@/lib/marketplace/review-actions";

function mkSupabase(options?: {
  companyOwned?: boolean;
  item?: { company_id: string | null; visibility: string; verification: string } | null;
  updateError?: string | null;
}) {
  const companyOwned = options?.companyOwned ?? true;
  const item = options?.item ?? { company_id: "company-1", visibility: "company_private", verification: "unverified" };

  const maybeSingleCompany = vi.fn(async () => ({ data: companyOwned ? { id: "company-1" } : null }));
  const maybeSingleItem = vi.fn(async () => ({ data: item }));

  const companyEq2 = { eq: vi.fn(() => ({ maybeSingle: maybeSingleCompany })) };
  const companyEq1 = { eq: vi.fn(() => companyEq2) };
  const companySelect = { select: vi.fn(() => companyEq1) };

  const itemEq1 = { maybeSingle: maybeSingleItem };
  const itemEq0 = { eq: vi.fn(() => itemEq1) };
  const itemSelect = { select: vi.fn(() => itemEq0) };

  const updateEq1 = { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: options?.updateError ? { message: options.updateError } : null })) })) };
  const updateBuilder = { update: vi.fn(() => updateEq1) };

  const from = vi.fn((table: string) => {
    if (table === "companies") return companySelect;
    if (table === "marketplace_items") return { ...itemSelect, ...updateBuilder };
    throw new Error(`unexpected table ${table}`);
  });

  return { client: { from }, update: updateBuilder.update };
}

const basePolicy = {
  decision: "approval_required" as const,
  requiresApproval: true as const,
  approvedAt: "2026-08-07T00:00:00.000Z",
  actor: "founder" as const,
  agent: "harmony" as const,
  domain: "operations" as const,
  action: "publish_externally" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ id: "founder-1" });
  mockResolvePrimaryCompanyId.mockResolvedValue("company-1");
});

describe("marketplace moderation runtime", () => {
  it("blocks unauthorized moderation", async () => {
    mockCreateClient.mockResolvedValue(mkSupabase({ companyOwned: false }).client);

    const result = await moderateMarketplaceItem({
      itemId: "item-1",
      decision: "approve",
      policyDecision: basePolicy,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("forbidden");
  });

  it("fails closed on missing/invalid policy", async () => {
    mockCreateClient.mockResolvedValue(mkSupabase().client);

    const result = await moderateMarketplaceItem({
      itemId: "item-1",
      decision: "approve",
      policyDecision: {
        ...basePolicy,
        approvedAt: "",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("stale_policy_evidence");
  });

  it("approval persists moderation evidence and sets verified/public", async () => {
    const s = mkSupabase();
    mockCreateClient.mockResolvedValue(s.client);

    const result = await moderateMarketplaceItem({
      itemId: "item-1",
      decision: "approve",
      reason: "Looks good",
      policyDecision: basePolicy,
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(s.update).toHaveBeenCalledTimes(1);
    const payload = s.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.verification).toBe("verified");
    expect(payload.visibility).toBe("marketplace_public");
    expect(payload.moderation_decision).toBe("approve");
    expect(payload.moderation_reason).toBe("Looks good");
    expect(payload.moderation_policy_decision).toEqual(basePolicy);
  });

  it("rejection persists evidence and item stays non-public", async () => {
    const s = mkSupabase();
    mockCreateClient.mockResolvedValue(s.client);

    const result = await moderateMarketplaceItem({
      itemId: "item-1",
      decision: "reject",
      reason: "Needs hardening",
      policyDecision: basePolicy,
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    const payload = s.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.verification).toBe("rejected");
    expect(payload.visibility).toBe("company_private");
    expect(payload.moderation_decision).toBe("reject");
  });

  it("duplicate moderation decision is idempotent", async () => {
    mockCreateClient.mockResolvedValue(
      mkSupabase({
        item: { company_id: "company-1", visibility: "marketplace_public", verification: "verified" },
      }).client,
    );

    const result = await moderateMarketplaceItem({
      itemId: "item-1",
      decision: "approve",
      policyDecision: basePolicy,
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.idempotent).toBe(true);
  });
});
