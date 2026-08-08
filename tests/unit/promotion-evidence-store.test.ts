import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

type DbError = { code?: string; message?: string };

function makeBuilder(queue: Array<{ data: any; error: DbError | null }>) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => queue.shift() ?? { data: null, error: { message: "empty_queue" } }),
    maybeSingle: vi.fn(async () => queue.shift() ?? { data: null, error: { message: "empty_queue" } }),
  };
  return chain;
}

function makeAdmin(queueByTable: Record<string, Array<{ data: any; error: DbError | null }>>) {
  return {
    from: vi.fn((table: string) => makeBuilder(queueByTable[table] ?? [])),
  };
}

const baseInput = {
  request: {
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
    created_by: "00000000-0000-0000-0000-000000000001",
  },
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
      production_promotion_requests: [{ data: baseInput.request, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseInput.request.promotion_request_id,
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

    createAdminClientMock.mockReturnValue(admin as any);

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
      production_promotion_requests: [{ data: baseInput.request, error: null }],
      production_promotion_decisions: [
        {
          data: {
            promotion_request_id: baseInput.request.promotion_request_id,
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

    createAdminClientMock.mockReturnValue(admin as any);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");
    const result = await writeFounderPromotionEvidence({ ...baseInput, decision: "rejected" });

    expect(result.decision.decision).toBe("rejected");
    expect(result.decision.approved_at).toBeNull();
  });

  it("allows duplicate retry when existing founder decision is identical", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [
        { data: null, error: { code: "23505" } },
        { data: baseInput.request, error: null },
      ],
      production_promotion_decisions: [
        { data: null, error: { code: "23505" } },
        {
          data: {
            decision: "approved",
            actor_id: baseInput.actorId,
            approved_at: new Date().toISOString(),
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as any);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");
    const result = await writeFounderPromotionEvidence(baseInput);

    expect(result.decision.decision).toBe("approved");
    expect(result.decision.actor_id).toBe(baseInput.actorId);
  });

  it("rejects changing existing rejected decision to approved", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: baseInput.request, error: null }],
      production_promotion_decisions: [
        { data: null, error: { code: "23505" } },
        {
          data: {
            decision: "rejected",
            actor_id: baseInput.actorId,
            approved_at: null,
          },
          error: null,
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin as any);

    const { writeFounderPromotionEvidence } = await import("@/lib/promotion/evidence-store");

    await expect(writeFounderPromotionEvidence(baseInput)).rejects.toThrow("promotion_decision_rejected_immutable");
  });
});
