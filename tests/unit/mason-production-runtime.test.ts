import { describe, expect, it, vi } from "vitest";
import { createMasonProductionAdapters, masonRuntimeHealth } from "@/lib/harmony/code/mason-production-runtime";

vi.mock("@/lib/integrations/connections", () => ({
  getConnections: vi.fn(async () => [
    { provider: "github", status: "connected" },
    { provider: "vercel", status: "connected" },
  ]),
}));

vi.mock("@/lib/integrations/connectors", () => ({
  CONNECTORS: [
    {
      id: "github",
      capabilities: [
        { id: "create_branch", mode: "write", risk: "routine" },
        { id: "open_pull_request", mode: "write", risk: "routine" },
        { id: "merge_pull_request", mode: "write", risk: "approval" },
        { id: "delete_repository", mode: "write", risk: "destructive" },
      ],
    },
    {
      id: "vercel",
      capabilities: [
        { id: "deployment_status", mode: "read" },
        { id: "trigger_deployment", mode: "write", risk: "routine" },
      ],
    },
  ],
  getConnector: vi.fn((id: string) => ({ id, auth: id === "vercel" ? "api_key" : "oauth2", requiredEnv: [] })),
}));

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
    await expect(masonRuntimeHealth("founder-1")).resolves.toEqual({ github: true, vercel: true, harmony: true });
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
