import { describe, expect, it, vi } from "vitest";
import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";

vi.mock("@/lib/integrations/connections", () => ({
  getConnections: vi.fn(async () => [
    { provider: "github", status: "connected" },
    { provider: "vercel", status: "connected" },
  ]),
}));

describe("Mason production runtime", () => {
  it("waits for Founder approval", async () => {
    const result = await runMasonProductionRuntime({
      userId: "user-1",
      objective: "repair dashboard sidebar",
      repository: "AIOS-HQ/aios-platform",
      requesterRole: "founder",
      founderApproved: false,
    });

    expect(result.status).toBe("blocked");
  });
});
