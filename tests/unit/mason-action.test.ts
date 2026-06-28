import { describe, expect, it, vi } from "vitest";
import { handleMasonEngineeringMessage } from "@/lib/workforce/mason-action";

vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  runMasonProductionRuntime: vi.fn(async (input) => ({
    status: input.founderApproved ? "completed" : "blocked",
    summary: "Founder approval required before execution.",
    pullRequestUrl: null,
    previewUrl: null,
  })),
}));

describe("Mason action wrapper", () => {
  it("routes founder Mason messages into the production runtime with approval gated off", async () => {
    const result = await handleMasonEngineeringMessage({
      userId: "founder-1",
      message: "Mason, fix the Founder Dashboard sidebar.",
    });

    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("Founder approval");
  });
});
