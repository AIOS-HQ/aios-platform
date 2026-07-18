import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/user", () => ({ requireUser: vi.fn(async () => ({ id: "founder-1" })) }));

describe("deployment identity route", () => {
  it("returns safe build metadata", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    process.env.VERCEL_ENV = "preview";
    process.env.BUILD_TIMESTAMP = "2026-07-18T00:00:00.000Z";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_123";

    const { GET } = await import("@/app/api/harmony/deployment-identity/route");
    const res = await GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.identity).toMatchObject({
      commitSha: "abc123",
      environment: "preview",
      buildTimestamp: "2026-07-18T00:00:00.000Z",
      vercelDeploymentId: "dpl_123",
    });
  });
});
