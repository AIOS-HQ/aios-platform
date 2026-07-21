import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  admin: false,
}));

vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("@/lib/auth/roles", () => ({
  currentUserIsAdmin: vi.fn(async () => authState.admin),
}));

describe("Founder Evidence Layer certification endpoint", () => {
  beforeEach(() => {
    authState.user = null;
    authState.admin = false;
    process.env.VERCEL_GIT_COMMIT_SHA = "safe-commit-sha";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_safe";
  });

  it("rejects unauthenticated requests", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects authenticated non-Founder requests", async () => {
    authState.user = { id: "subscriber-1" };
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
  });

  it("returns only canonical safe evidence metadata to a Founder", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.certification).toMatchObject({
      status: "healthy",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "api.admin.certification.evidence",
      confidence: 1,
      details: {
        scope: "evidence_layer",
        schemaVersion: "1.0.0",
        deployment: {
          commitSha: "safe-commit-sha",
          environment: "production",
          vercelDeploymentId: "dpl_safe",
        },
        workforceRegistry: { version: "2.1", agentCount: 10 },
      },
    });
    expect(body.certification.details.supportedEvidenceTypes).toHaveLength(6);
    expect(body.certification.details.workforceRegistry.agentKeys).toContain("harmony");

    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["access_token", "authorization", "cookie", "credential", "prompt", "memory", "customer"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("founder-1");
  });
});
