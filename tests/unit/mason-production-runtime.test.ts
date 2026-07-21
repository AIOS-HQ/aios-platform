import { describe, expect, it, vi } from "vitest";
import { createMasonProductionAdapters, masonRuntimeHealth } from "@/lib/harmony/code/mason-production-runtime";

const { vercelStatusMock } = vi.hoisted(() => ({
  vercelStatusMock: vi.fn(async () => ({
    status: "healthy",
    evidenceTier: "github_vercel_deployment_status",
    evidenceSources: ["github_vercel_status"],
    gitShaMatches: true,
  })),
}));

vi.mock("@/lib/integrations/clients/vercel", () => ({
  getCanonicalVercelDeploymentStatus: (...args: unknown[]) => vercelStatusMock(...args),
}));

vi.mock("@/lib/integrations/connections", () => ({
  getConnections: vi.fn(async () => [
    { provider: "github", status: "connected" },
    { provider: "vercel", status: "connected" },
  ]),
}));

vi.mock("@/lib/integrations/connectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/connectors")>();
  return {
    ...actual,
    getConnector: vi.fn((id: string) => ({
      id,
      auth: id === "vercel" ? "api_key" : "oauth2",
      requiredEnv: [],
      capabilities:
        id === "github"
          ? [
              { id: "create_branch", mode: "write" },
              { id: "commit_file_to_branch", mode: "write" },
              { id: "open_pull_request", mode: "write" },
              { id: "create_issue", mode: "write" },
            ]
          : [{ id: "deployment_status", mode: "read" }],
    })),
  };
});

vi.mock("@/lib/integrations/connector-config", () => ({
  isConnectorConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/integrations/connector-runtime", () => ({
  runConnectorCapability: vi.fn(async () => ({ ok: true, status: "executed", message: "ok", data: { ok: true } })),
}));

vi.mock("@/lib/harmony/os/events", () => ({ emitActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/julius/wiring", () => ({ juliusRemember: vi.fn(async () => true) }));
vi.mock("@/lib/company-skills/library", () => ({ learnCompanySkill: vi.fn(async () => ({ id: "skill-1" })) }));

describe("Mason production runtime", () => {
  it("reports connector health", async () => {
    await expect(masonRuntimeHealth("founder-1")).resolves.toEqual({
      github: true,
      vercel: true,
      vercelStatus: "healthy",
      vercelEvidenceTier: "github_vercel_deployment_status",
      vercelEvidenceSources: ["github_vercel_status"],
      vercelGitShaMatches: true,
      harmony: true,
    });
  });

  it("keeps Mason health available when Vercel evidence is unavailable", async () => {
    vercelStatusMock.mockResolvedValueOnce({
      status: "unavailable",
      evidenceTier: "unavailable",
      evidenceSources: [],
      gitShaMatches: null,
    });
    await expect(masonRuntimeHealth("founder-1")).resolves.toMatchObject({
      github: true,
      harmony: true,
      vercel: false,
      vercelStatus: "unavailable",
      vercelEvidenceTier: "unavailable",
    });
  });

  it("creates production adapters", () => {
    const adapters = createMasonProductionAdapters({
      userId: "founder-1",
      objective: "Fix dashboard sidebar",
      repository: "AIOS-HQ/aios-platform",
      requesterRole: "founder",
      founderApproved: true,
    });

    expect(adapters.github).toBeTruthy();
    expect(adapters.vercel).toBeTruthy();
    expect(adapters.harmony).toBeTruthy();
  });
});
