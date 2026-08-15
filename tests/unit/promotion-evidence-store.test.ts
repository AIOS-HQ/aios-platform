import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

type DbError = { code?: string; message?: string };

function makeBuilder(queue: Array<{ data: unknown; error: DbError | null }>) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => queue.shift() ?? { data: null, error: { message: "empty_queue" } }),
    maybeSingle: vi.fn(async () => queue.shift() ?? { data: null, error: { message: "empty_queue" } }),
  };
  return chain;
}

function makeAdmin(queueByTable: Record<string, Array<{ data: unknown; error: DbError | null }>>) {
  return {
    from: vi.fn((table: string) => makeBuilder(queueByTable[table] ?? [])),
  };
}

const baseRequest = {
  promotion_request_id: "req-001",
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
  created_by: "00000000-0000-0000-0000-000000000001",
};

const baseInput = {
  request: baseRequest,
  actorId: "founder-1",
  decision: "approved" as const,
};

describe("writeFounderPromotionEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("writes request and founder decision via admin client", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseRequest.promotion_request_id,
            decision_source: "founder",
            decision: "approved",
            actor_type: "founder",
            actor_id: baseInput.actorId,
            agent_id: null,
            policy_version: null,
            evidence_id: "evidence-1",
            decided_at: new Date().toISOString(),
            approved_at: new Date().toISOString(),
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");
    const result = await writeFounderPromotionEvidence(baseInput);

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(result.decision.decision_source).toBe("founder");
    expect(result.decision.actor_type).toBe("founder");
    expect(result.decision.actor_id).toBe(baseInput.actorId);
    expect(result.decision.approved_at).not.toBeNull();
    expect(result.decision.evidence_id).toBeTruthy();
  });

  it("sets approved_at null for rejected founder decision", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseRequest.promotion_request_id,
            decision_source: "founder",
            decision: "rejected",
            actor_type: "founder",
            actor_id: baseInput.actorId,
            agent_id: null,
            policy_version: null,
            evidence_id: "evidence-2",
            decided_at: new Date().toISOString(),
            approved_at: null,
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");
    const result = await writeFounderPromotionEvidence({ ...baseInput, decision: "rejected" });

    expect(result.decision.decision).toBe("rejected");
    expect(result.decision.approved_at).toBeNull();
  });

  it("allows duplicate retry when existing founder decision is identical", async () => {
    const persistedDecidedAt = "2026-08-08T12:00:00.000Z";
    const persistedApprovedAt = "2026-08-08T12:00:00.000Z";
    const persistedEvidenceId = "persisted-evidence-123";

    const admin = makeAdmin({
      production_promotion_requests: [
        { data: null, error: { code: "23505" } },
        { data: baseRequest, error: null },
      ],
      production_promotion_decisions: [
        { data: null, error: { code: "23505" } },
        {
          data: {
            decision_source: "founder",
            decision: "approved",
            actor_type: "founder",
            actor_id: baseInput.actorId,
            evidence_id: persistedEvidenceId,
            decided_at: persistedDecidedAt,
            approved_at: persistedApprovedAt,
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");
    const result = await writeFounderPromotionEvidence(baseInput);

    expect(result.decision.decision).toBe("approved");
    expect(result.decision.actor_id).toBe(baseInput.actorId);
    expect(result.decision.evidence_id).toBe(persistedEvidenceId);
    expect(result.decision.decided_at).toBe(persistedDecidedAt);
    expect(result.decision.approved_at).toBe(persistedApprovedAt);
  });

  it("rejects changing existing rejected decision to approved", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        { data: null, error: { code: "23505" } },
        {
          data: {
            decision_source: "founder",
            decision: "rejected",
            actor_type: "founder",
            actor_id: baseInput.actorId,
            evidence_id: "persisted-rejected-evidence",
            decided_at: "2026-08-08T12:00:00.000Z",
            approved_at: null,
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");

    await expect(writeFounderPromotionEvidence(baseInput)).rejects.toThrow("promotion_decision_rejected_immutable");
  });
});

describe("writeHarmonyPromotionDecision", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("approves valid persisted request with fixed harmony policy metadata", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseRequest.promotion_request_id,
            decision_source: "harmony",
            decision: "approved",
            actor_type: null,
            actor_id: null,
            agent_id: "harmony",
            policy_version: "production-promotion-governance-v1",
            evidence_id: "harmony-evidence-1",
            decided_at: "2026-08-08T00:00:00.000Z",
            approved_at: "2026-08-08T00:00:00.000Z",
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { HARMONY_POLICY_VERSION, writeHarmonyPromotionDecision } = await import("@/lib/promotion/evidence-store");
    const result = await writeHarmonyPromotionDecision({ promotionRequestId: baseRequest.promotion_request_id });

    expect(result.decision.decision_source).toBe("harmony");
    expect(result.decision.decision).toBe("approved");
    expect(result.decision.agent_id).toBe("harmony");
    expect(result.decision.actor_type).toBeNull();
    expect(result.decision.actor_id).toBeNull();
    expect(result.decision.policy_version).toBe(HARMONY_POLICY_VERSION);
    expect(result.decision.evidence_id).toBeTruthy();
    expect(result.decision.approved_at).toBeTruthy();
  });

  it("fails closed (rejects) when persisted request is invalid", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: { ...baseRequest, repository: "wrong/repo" }, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseRequest.promotion_request_id,
            decision_source: "harmony",
            decision: "rejected",
            actor_type: null,
            actor_id: null,
            agent_id: "harmony",
            policy_version: "production-promotion-governance-v1",
            evidence_id: "harmony-evidence-2",
            decided_at: "2026-08-08T00:00:00.000Z",
            approved_at: null,
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeHarmonyPromotionDecision } = await import("@/lib/promotion/evidence-store");
    const result = await writeHarmonyPromotionDecision({ promotionRequestId: baseRequest.promotion_request_id });

    expect(result.decision.decision).toBe("rejected");
    expect(result.decision.approved_at).toBeNull();
  });

  it("does not require founder decision for harmony evaluation", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseRequest.promotion_request_id,
            decision_source: "harmony",
            decision: "approved",
            actor_type: null,
            actor_id: null,
            agent_id: "harmony",
            policy_version: "production-promotion-governance-v1",
            evidence_id: "harmony-evidence-3",
            decided_at: "2026-08-08T00:00:00.000Z",
            approved_at: "2026-08-08T00:00:00.000Z",
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeHarmonyPromotionDecision } = await import("@/lib/promotion/evidence-store");
    const result = await writeHarmonyPromotionDecision({ promotionRequestId: baseRequest.promotion_request_id });

    expect(result.decision.decision_source).toBe("harmony");
    expect(result.decision.decision).toBe("approved");
  });

  it("returns persisted harmony identity on duplicate retry", async () => {
    const persisted = {
      decision_source: "harmony",
      decision: "approved",
      actor_type: null,
      actor_id: null,
      agent_id: "harmony",
      policy_version: "production-promotion-governance-v1",
      evidence_id: "persisted-harmony-evidence",
      decided_at: "2026-08-08T08:00:00.000Z",
      approved_at: "2026-08-08T08:00:00.000Z",
    };

    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseRequest, error: null }],
      production_promotion_decisions: [
        { data: null, error: { code: "23505" } },
        { data: persisted, error: null },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClientMock>);

    const { writeHarmonyPromotionDecision } = await import("@/lib/promotion/evidence-store");
    const result = await writeHarmonyPromotionDecision({ promotionRequestId: baseRequest.promotion_request_id });

    expect(result.decision.evidence_id).toBe(persisted.evidence_id);
    expect(result.decision.decided_at).toBe(persisted.decided_at);
    expect(result.decision.approved_at).toBe(persisted.approved_at);
  });
});
