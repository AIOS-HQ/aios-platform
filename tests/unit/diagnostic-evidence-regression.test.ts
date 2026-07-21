import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  secret: null as null | { externalAccount: string; accessToken: string },
  vercelStatus: {
    status: "healthy",
    evidenceTier: "direct_vercel_api",
    evidenceSources: ["vercel_api", "vercel_alias"],
    canonicalDomain: "aios-platform-omega.vercel.app",
    requiredChecksPassed: true,
    readyState: "READY",
    deploymentState: "READY",
  } as Record<string, unknown>,
  vercelConfigured: true,
}));

vi.mock("@/lib/integrations/secrets", () => ({
  getConnectionSecret: vi.fn(async () => state.secret),
}));

vi.mock("@/lib/integrations/clients/vercel", () => ({
  getCanonicalVercelDeploymentStatus: vi.fn(async () => state.vercelStatus),
}));

vi.mock("@/lib/integrations/vercel/deployment-status", () => ({
  getVercelConfigurationPresence: () => ({
    tokenPresent: state.vercelConfigured,
    teamPresent: state.vercelConfigured,
    projectPresent: state.vercelConfigured,
    canonicalDomainPresent: state.vercelConfigured,
    complete: state.vercelConfigured,
  }),
}));

describe("diagnostic Evidence Layer regression", () => {
  beforeEach(() => {
    state.secret = null;
    state.vercelConfigured = true;
  });

  it("returns configuration evidence when Supabase diagnostics cannot connect", async () => {
    const { runSupabaseDiagnostics } = await import("@/lib/integrations/clients/supabase-diagnostics");
    const result = await runSupabaseDiagnostics("founder-1");

    expect(result).toMatchObject({
      connected: false,
      status: "unavailable",
      evidenceType: "configuration_proof",
      observedBy: "diagnostics.supabase",
      details: { scope: "supabase_diagnostics", itemCount: 0 },
    });
  });

  it("preserves Vercel diagnostic compatibility while adding live evidence", async () => {
    const { runVercelDiagnostics } = await import("@/lib/integrations/clients/vercel-diagnostics");
    const result = await runVercelDiagnostics("founder-1");

    expect(result.connected).toBe(true);
    expect(result.status).toBe("healthy");
    expect(result.evidenceType).toBe("live_runtime_proof");
    expect(result.items.map((item) => item.id)).toEqual([
      "deployment_status",
      "production_url_verification",
      "build_status",
      "env_var_presence",
    ]);
    expect(result.items.every((item) => item.evidenceType !== "unknown")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token-value|secret-value/i);
  });
});
