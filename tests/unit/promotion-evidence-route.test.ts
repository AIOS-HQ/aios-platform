import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  admin: false,
}));

const writeFounderPromotionEvidence = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("@/lib/auth/roles", () => ({
  currentUserIsAdmin: vi.fn(async () => authState.admin),
}));

vi.mock("@/lib/promotion/evidence-store", () => ({
  writeFounderPromotionEvidence,
}));

function request(body: unknown) {
  return new Request("https://aios.example/api/admin/promotion/evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  decision: "approved",
  repository: "AIOS-HQ/aios-platform",
  purpose: "production_promotion",
  target_sha: "a".repeat(40),
  source_environment: "staging",
  target_environment: "production",
  runtime_evidence_id: "runtime-evidence-1",
  runtime_artifact_id: "runtime-artifact-1",
  migration_evidence_id: "migration-evidence-1",
  migration_artifact_id: "migration-artifact-1",
  preview_certification_waiver: false,
  preview_certification_waiver_reason: null,
};

function derivedPromotionRequestId(body: Omit<typeof validBody, "decision">): string {
  const tuple = [
    body.repository,
    body.purpose,
    body.target_sha,
    body.source_environment,
    body.target_environment,
    body.runtime_evidence_id ?? "",
    body.runtime_artifact_id ?? "",
    body.migration_evidence_id,
    body.migration_artifact_id,
    body.preview_certification_waiver ? "true" : "false",
    body.preview_certification_waiver_reason ?? "",
  ];

  return `promotion-request:${createHash("sha256").update(tuple.join("|"), "utf8").digest("hex")}`;
}

describe("admin promotion evidence POST route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
    authState.admin = false;
    writeFounderPromotionEvidence.mockResolvedValue({
      request: {
        ...validBody,
        promotion_request_id: derivedPromotionRequestId(validBody),
        created_by: "founder-1",
      },
      decision: {
        promotion_request_id: derivedPromotionRequestId(validBody),
        decision_source: "founder",
        decision: "approved",
        actor_type: "founder",
        actor_id: "founder-1",
        agent_id: null,
        policy_version: null,
        evidence_id: "evidence-1",
        decided_at: "2026-08-08T00:00:00.000Z",
        approved_at: "2026-08-08T00:00:00.000Z",
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(writeFounderPromotionEvidence).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated user is not admin", async () => {
    authState.user = { id: "user-1" };
    authState.admin = false;

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(writeFounderPromotionEvidence).not.toHaveBeenCalled();
  });

  it("writes founder evidence for admin user", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.decision).toMatchObject({
      promotion_request_id: derivedPromotionRequestId(validBody),
      decision_source: "founder",
      actor_type: "founder",
      actor_id: "founder-1",
    });
  });

  it("derives promotion_request_id server-side from immutable inputs", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(writeFounderPromotionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          promotion_request_id: derivedPromotionRequestId(validBody),
        }),
      }),
    );
  });

  it("accepts a client-supplied promotion_request_id only when it matches canonical derivation", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const supplied = {
      ...validBody,
      promotion_request_id: derivedPromotionRequestId(validBody),
    };

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(supplied));

    expect(response.status).toBe(200);
    expect(writeFounderPromotionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          promotion_request_id: derivedPromotionRequestId(validBody),
        }),
      }),
    );
  });

  it("rejects mismatched client-supplied promotion_request_id", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const forged = {
      ...validBody,
      promotion_request_id: "forged-client-id",
    };

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(forged));

    expect(response.status).toBe(400);
    expect(writeFounderPromotionEvidence).not.toHaveBeenCalled();
  });

  it("ignores forged actorId and created_by from client payload", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const forged = {
      ...validBody,
      actorId: "evil-actor",
      created_by: "evil-created-by",
    };

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request(forged));

    expect(response.status).toBe(200);
    expect(writeFounderPromotionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "founder-1",
        request: expect.objectContaining({ created_by: "founder-1" }),
      }),
    );
  });

  it("returns 400 for malformed input", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;

    const { POST } = await import("@/app/api/admin/promotion/evidence/route");
    const response = await POST(request({ decision: "approved" }));

    expect(response.status).toBe(400);
    expect(writeFounderPromotionEvidence).not.toHaveBeenCalled();
  });
});
