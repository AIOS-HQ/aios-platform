import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AIOS workforce certification", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
  });

  it("certifies every named AIOS agent without treating Julius as an agent", async () => {
    const { certifyAiosWorkforce } = await import("@/lib/workforce/certification");
    const { AIOS_WORKFORCE } = await import("@/lib/workforce/registry");

    const certification = await certifyAiosWorkforce({ userId: null });

    expect(Object.keys(certification)).toEqual(AIOS_WORKFORCE.map((agent) => agent.key));
    expect(certification).not.toHaveProperty("julius");
    expect(certification.atlas.juliusAccess).toBe("steward");
  });

  it("keeps Mason Founder-only and blocked/configuration-required when engineering connectors are absent", async () => {
    const { certifyAiosWorkforce } = await import("@/lib/workforce/certification");

    const certification = await certifyAiosWorkforce({ userId: null });
    const mason = certification.mason;

    expect(mason.founderOnly).toBe(true);
    expect(["configuration_required", "blocked"]).toContain(mason.status);
    expect(mason.contract.unsupportedCapabilities).toEqual(
      expect.arrayContaining(["Direct production editing", "Unapproved merge", "Repository deletion"]),
    );
    expect(mason.blockers.join(" ")).toContain("github");
    expect(mason.blockers.join(" ")).toContain("vercel");
  });

  it("does not mark framework-only Ambassador channels as executable", async () => {
    const { certifyAiosWorkforce } = await import("@/lib/workforce/certification");

    const certification = await certifyAiosWorkforce({ userId: null });
    const ambassador = certification.ambassador;
    const frameworkOnly = ambassador.dependencyReadiness.filter((dep) =>
      ["whatsapp", "messenger", "instagram"].includes(dep.provider),
    );

    expect(frameworkOnly).toHaveLength(3);
    expect(frameworkOnly.every((dep) => dep.status === "metadata_only")).toBe(true);
    expect(ambassador.contract.unsupportedCapabilities.join(" ")).toContain("Framework-only Meta channel execution");
  });

  it("keeps Catalyst bound to Harmony Social approval providers", async () => {
    const { certifyAiosWorkforce } = await import("@/lib/workforce/certification");

    const certification = await certifyAiosWorkforce({ userId: null });
    const catalyst = certification.catalyst;

    expect(catalyst.dependencyReadiness.map((dep) => dep.provider)).toEqual(["linkedin", "x", "youtube"]);
    expect(catalyst.contract.approvalPolicy).toContain("Harmony Social approval");
    expect(catalyst.contract.unsupportedCapabilities.join(" ")).toContain("Ungoverned publishing");
  });

  it("reports Vercel unavailable until a real token configuration exists", async () => {
    const { isConnectorConfigured } = await import("@/lib/integrations/connector-config");
    const { getConnector } = await import("@/lib/integrations/connectors");
    const vercel = getConnector("vercel");

    expect(vercel).toBeDefined();
    expect(isConnectorConfigured(vercel!)).toBe(false);

    process.env.VERCEL_TOKEN = "configured-token-name-only";
    expect(isConnectorConfigured(vercel!)).toBe(true);
  });
});
