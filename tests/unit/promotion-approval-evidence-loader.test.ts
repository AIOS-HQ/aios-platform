import { beforeEach, describe, expect, it, vi } from "vitest";
import { validatePromotionApprovalEvidence } from "../../scripts/ci/promotion-approval-evidence.mjs";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

type DbError = { code?: string; message?: string };

function makeBuilder(queue: Array<{ data: any; error: DbError | null }>) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => queue.shift() ?? { data: null, error: { message: "empty_queue" } }),
  };
  return chain;
}

function makeAdmin(queueByTable: Record<string, Array<{ data: any; error: DbError | null }>>) {
  return {
    from: vi.fn((table: string) => makeBuilder(queueByTable[table] ?? [])),
  };
}

const requestRow = {
  promotion_request_id: "promotion-request:abc123",
  repository: "AIOS-HQ/aios-platform",
  purpose: "production_promotion",
  target_sha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
  source_environment: "staging",
  target_environment: "production",
  runtime_evidence_id: "runtime-evidence:123",
  runtime_artifact_id: "github-artifact:22222",
  migration_evidence_id: "migration-evidence:456",
  migration_artifact_id: "github-artifact:33333",
};

const founderRow = {
  promotion_request_id: "promotion-request:abc123",
  decision_source: "founder",
  decision: "approved",
  actor_type: "founder",
  actor_id: "founder-1",
  evidence_id: "founder-approval:789",
  approved_at: "2026-08-08T10:00:00.000Z",
};

const harmonyRow = {
  promotion_request_id: "promotion-request:abc123",
  decision_source: "harmony",
  decision: "approved",
  agent_id: "harmony",
  policy_version: "production-promotion-governance-v1",
  evidence_id: "harmony-approval:987",
  approved_at: "2026-08-08T10:01:00.000Z",
};

describe("loadPersistedPromotionApprovalEvidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("maps valid persisted rows into contract-compatible input", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [{ data: founderRow, error: null }, { data: harmonyRow, error: null }],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    const mapped = await loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id);
    const contract = validatePromotionApprovalEvidence(mapped, { expectedSha: requestRow.target_sha });

    expect(mapped.subject.promotionRequestId).toBe(requestRow.promotion_request_id);
    expect(contract.subject.targetSha).toBe(requestRow.target_sha);
    expect(contract.founderApproval.evidenceId).toBe(founderRow.evidence_id);
    expect(contract.harmonyGovernanceApproval.evidenceId).toBe(harmonyRow.evidence_id);
  });

  it("fails closed when founder decision is missing", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [{ data: null, error: { code: "PGRST116" } }],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    await expect(loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id)).rejects.toThrow("founder_decision_missing");
  });

  it("fails closed when founder decision is rejected", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [
        { data: { ...founderRow, decision: "rejected", approved_at: null }, error: null },
      ],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    await expect(loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id)).rejects.toThrow("founder_decision_invalid");
  });

  it("fails closed when harmony decision is missing", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [
        { data: founderRow, error: null },
        { data: null, error: { code: "PGRST116" } },
      ],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    await expect(loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id)).rejects.toThrow("harmony_decision_missing");
  });

  it("fails closed when harmony decision is rejected", async () => {
    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [
        { data: founderRow, error: null },
        { data: { ...harmonyRow, decision: "rejected", approved_at: null }, error: null },
      ],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    await expect(loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id)).rejects.toThrow("harmony_decision_invalid");
  });

  it("preserves persisted ids, timestamps, and policy version exactly", async () => {
    const customFounder = {
      ...founderRow,
      evidence_id: "founder-evidence:exact-111",
      approved_at: "2026-08-08T11:11:11.111Z",
    };
    const customHarmony = {
      ...harmonyRow,
      evidence_id: "harmony-evidence:exact-222",
      approved_at: "2026-08-08T11:22:22.222Z",
      policy_version: "production-promotion-governance-v1",
    };

    const admin = makeAdmin({
      production_promotion_requests: [{ data: requestRow, error: null }],
      production_promotion_decisions: [{ data: customFounder, error: null }, { data: customHarmony, error: null }],
    });
    createAdminClientMock.mockReturnValue(admin as any);

    const { loadPersistedPromotionApprovalEvidence } = await import("@/lib/promotion/approval-evidence-loader");
    const mapped = await loadPersistedPromotionApprovalEvidence(requestRow.promotion_request_id);

    expect(mapped.founderApproval.evidenceId).toBe(customFounder.evidence_id);
    expect(mapped.founderApproval.approvedAt).toBe(customFounder.approved_at);
    expect(mapped.harmonyGovernanceApproval.evidenceId).toBe(customHarmony.evidence_id);
    expect(mapped.harmonyGovernanceApproval.approvedAt).toBe(customHarmony.approved_at);
    expect(mapped.harmonyGovernanceApproval.governancePolicyVersion).toBe(customHarmony.policy_version);
  });
});
