import { beforeEach, describe, expect, it, vi } from "vitest";

const adminState = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: adminState.row, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

describe("normalized connector health", () => {
  beforeEach(() => {
    adminState.row = null;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  });

  it("reports missing developer configuration without exposing secrets", async () => {
    const { getProviderHealth } = await import("@/lib/integrations/connector-health");
    const health = await getProviderHealth("user-1", "github");

    expect(health.configured).toBe(false);
    expect(health.connected).toBe(false);
    expect(health.healthy).toBe(false);
    expect(health.blockers.join(" ")).toContain("OAuth family");
    expect(JSON.stringify(health)).not.toMatch(/token-value|secret-value/i);
  });

  it("reports expired non-refreshable OAuth credentials as invalid", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
    adminState.row = {
      provider: "github",
      status: "connected",
      access_token: "enc:v1:token-value",
      refresh_token: null,
      expires_at: "2020-01-01T00:00:00.000Z",
      connected_at: "2020-01-01T00:00:00.000Z",
      scopes: "read:user repo",
      external_account: "AIOS-HQ",
    };

    const { getProviderHealth } = await import("@/lib/integrations/connector-health");
    const health = await getProviderHealth("user-1", "github");

    expect(health.connected).toBe(true);
    expect(health.token.present).toBe(true);
    expect(health.token.valid).toBe(false);
    expect(health.healthy).toBe(false);
    expect(health.blockers.join(" ")).toContain("expired");
    expect(JSON.stringify(health)).not.toContain("token-value");
  });

  it("reports healthy configured connections and honest implemented capabilities", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
    adminState.row = {
      provider: "github",
      status: "connected",
      access_token: "enc:v1:token-value",
      refresh_token: null,
      expires_at: "2999-01-01T00:00:00.000Z",
      connected_at: "2026-01-01T00:00:00.000Z",
      scopes: "read:user repo",
      external_account: "AIOS-HQ",
    };

    const { getProviderHealth } = await import("@/lib/integrations/connector-health");
    const health = await getProviderHealth("user-1", "github");

    expect(health.configured).toBe(true);
    expect(health.connected).toBe(true);
    expect(health.healthy).toBe(true);
    expect(health.identity).toBe("AIOS-HQ");
    expect(health.capabilityDetails.some((cap) => cap.implemented)).toBe(true);
    expect(JSON.stringify(health)).not.toContain("token-value");
  });
});

describe("secret redaction", () => {
  it("redacts tokens and provider diagnostics", async () => {
    const { redactDiagnostics, redactSecret } = await import("@/lib/integrations/secret-redaction");

    expect(redactSecret("Authorization: Bearer abc123SECRET")).toBe("Authorization: Bearer [REDACTED]");
    expect(redactDiagnostics({ access_token: "abc123SECRET", nested: { apiKey: "key" } })).toEqual({
      access_token: "[REDACTED]",
      nested: { apiKey: "[REDACTED]" },
    });
  });
});
