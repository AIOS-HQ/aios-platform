import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { producePromotionAttestation } from "../../scripts/ci/produce-promotion-attestation.mjs";

const DIAGNOSTIC_REQUEST_ID = "promotion-request:6c99fe3e86a4c298511351e98741f5d528172cd1bfc6f9ad2a213ce4e7842eb6";

const createClientMock = vi.hoisted(() => vi.fn());
const loadSharedMock = vi.hoisted(() => vi.fn());
const validateMock = vi.hoisted(() => vi.fn());
const runDiagnosticMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("../../src/lib/promotion/approval-evidence-shared", () => ({
  PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID: DIAGNOSTIC_REQUEST_ID,
  loadPersistedPromotionApprovalEvidenceWithClient: loadSharedMock,
  runPromotionPersistenceReadOnlyDiagnosticWithClient: runDiagnosticMock,
}));

runDiagnosticMock.mockResolvedValue({
    requestId: DIAGNOSTIC_REQUEST_ID,
    adminReadAccess: true,
    productionPromotionRequestsQueryable: true,
    productionPromotionDecisionsQueryable: true,
    previewWaiverFieldsQueryable: true,
    waiverRuntimePathSupported: true,
    requestExists: true,
    founderDecisionExists: true,
    harmonyDecisionExists: true,
  });
vi.mock("../../scripts/ci/promotion-approval-evidence.mjs", () => ({
  validatePromotionApprovalEvidence: validateMock,
}));

const rawMappedPayload = {
  subject: {
    repository: "AIOS-HQ/aios-platform",
    purpose: "production_promotion",
    targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    promotionRequestId: "promotion-request:abc123",
    runtimeEvidenceId: "runtime-evidence:123",
    runtimeArtifactId: "github-artifact:22222",
    migrationEvidenceId: "migration-evidence:456",
    migrationArtifactId: "github-artifact:33333",
  },
  founderApproval: {
    promotionRequestId: "promotion-request:abc123",
    targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
    purpose: "production_promotion",
    authority: "founder",
    decision: "approved",
    actorType: "founder",
    actorId: "founder-1",
    evidenceId: "founder-approval:789",
    approvedAt: "2026-08-08T10:00:00.000Z",
    runtimeEvidenceId: "runtime-evidence:123",
    runtimeArtifactId: "github-artifact:22222",
    migrationEvidenceId: "migration-evidence:456",
    migrationArtifactId: "github-artifact:33333",
  },
  harmonyGovernanceApproval: {
    promotionRequestId: "promotion-request:abc123",
    targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
    purpose: "production_promotion",
    authority: "harmony",
    decision: "approved",
    agentId: "harmony",
    evidenceId: "harmony-approval:987",
    approvedAt: "2026-08-08T10:01:00.000Z",
    governancePolicyVersion: "production-promotion-governance-v1",
    runtimeEvidenceId: "runtime-evidence:123",
    runtimeArtifactId: "github-artifact:22222",
    migrationEvidenceId: "migration-evidence:456",
    migrationArtifactId: "github-artifact:33333",
  },
};

const normalizedPayload = {
  subject: { targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300" },
  founderApproval: { status: "approved" },
  harmonyGovernanceApproval: { status: "approved" },
  bundleId: "promotion-approval-bundle:abc",
};

describe("exportPersistedPromotionApprovalEvidence", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
    createClientMock.mockReturnValue({ from: vi.fn() });
    loadSharedMock.mockResolvedValue(rawMappedPayload);
    validateMock.mockReturnValue(normalizedPayload);
    runDiagnosticMock.mockResolvedValue({
      requestId: DIAGNOSTIC_REQUEST_ID,
      adminReadAccess: true,
      productionPromotionRequestsQueryable: true,
      productionPromotionDecisionsQueryable: true,
      previewWaiverFieldsQueryable: true,
      waiverRuntimePathSupported: true,
      requestExists: true,
      founderDecisionExists: true,
      harmonyDecisionExists: true,
    });
  });

  it("validates raw mapped payload then writes and returns original raw mapped JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "promotion-approval-export-"));
    try {
      const out = join(dir, "approval.json");
      const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");

      const result = await exportPersistedPromotionApprovalEvidence(
        "promotion-request:abc123",
        "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
        out,
      );

      expect(createClientMock).toHaveBeenCalledTimes(1);
      expect(runDiagnosticMock).toHaveBeenCalledTimes(1);
      expect(loadSharedMock).toHaveBeenCalledTimes(1);
      expect(validateMock).toHaveBeenCalledWith(rawMappedPayload, { expectedSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300" });
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(rawMappedPayload);
      expect(JSON.parse(readFileSync(out, "utf8"))).not.toEqual(normalizedPayload);
      expect(result).toEqual(rawMappedPayload);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exported raw JSON works downstream as promotionApprovalEvidence in final composer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "promotion-approval-export-"));
    try {
      const out = join(dir, "approval.json");
      const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
      validateMock.mockImplementation((input) => ({
        ...input,
        founderApproval: {
          ...input.founderApproval,
          status: "approved",
        },
        harmonyGovernanceApproval: {
          ...input.harmonyGovernanceApproval,
          status: "approved",
        },
      }));
      await exportPersistedPromotionApprovalEvidence(
        "promotion-request:abc123",
        rawMappedPayload.subject.targetSha,
        out,
      );

      const exported = JSON.parse(readFileSync(out, "utf8"));
      const approvalForComposer = {
        ...exported,
        founderApproval: {
          ...exported.founderApproval,
          decision: "approved",
        },
        harmonyGovernanceApproval: {
          ...exported.harmonyGovernanceApproval,
          decision: "approved",
        },
      };
      const attestation = producePromotionAttestation({
        expectedTargetSha: rawMappedPayload.subject.targetSha,
        promotionApprovalEvidence: approvalForComposer,
        stagingPromotionEvidence: {
          repository: rawMappedPayload.subject.repository,
          sourceEnvironment: "staging",
          targetEnvironment: "production",
          targetSha: rawMappedPayload.subject.targetSha,
          runtimeCertification: {
            status: "passed",
            targetSha: rawMappedPayload.subject.targetSha,
            evidenceId: rawMappedPayload.subject.runtimeEvidenceId,
            artifactId: rawMappedPayload.subject.runtimeArtifactId,
            verifiedAt: "2026-08-08T10:00:00.000Z",
          },
          migrationPlanCertification: {
            status: "passed",
            targetSha: rawMappedPayload.subject.targetSha,
            evidenceId: rawMappedPayload.subject.migrationEvidenceId,
            artifactId: rawMappedPayload.subject.migrationArtifactId,
            verifiedAt: "2026-08-08T10:01:00.000Z",
          },
        },
      });

      expect(attestation.founderApproval.evidenceId).toBe(rawMappedPayload.founderApproval.evidenceId);
      expect(attestation.harmonyGovernanceApproval.evidenceId).toBe(rawMappedPayload.harmonyGovernanceApproval.evidenceId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when credentials are missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "supabase_admin_unavailable",
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when shared loader fails", async () => {
    loadSharedMock.mockRejectedValue(new Error("founder_decision_missing"));
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "founder_decision_missing",
    );
    expect(runDiagnosticMock).toHaveBeenCalledTimes(1);
  });

  it("runs read-only diagnostic before loading persisted approvals", async () => {
    const order: string[] = [];
    runDiagnosticMock.mockImplementation(async () => {
      order.push("diagnostic");
      return {
        requestId: DIAGNOSTIC_REQUEST_ID,
        adminReadAccess: true,
        productionPromotionRequestsQueryable: true,
        productionPromotionDecisionsQueryable: true,
        previewWaiverFieldsQueryable: true,
        waiverRuntimePathSupported: false,
        requestExists: false,
        founderDecisionExists: false,
        harmonyDecisionExists: false,
      };
    });
    loadSharedMock.mockImplementation(async () => {
      order.push("load");
      return rawMappedPayload;
    });

    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await exportPersistedPromotionApprovalEvidence("promotion-request:missing", "a".repeat(40), join(tmpdir(), "diag-order.json"));

    expect(order).toEqual(["diagnostic", "load"]);
  });

  it("diagnoses missing rows and still fails closed afterward", async () => {
    runDiagnosticMock.mockResolvedValue({
      requestId: DIAGNOSTIC_REQUEST_ID,
      adminReadAccess: true,
      productionPromotionRequestsQueryable: true,
      productionPromotionDecisionsQueryable: true,
      previewWaiverFieldsQueryable: true,
      waiverRuntimePathSupported: false,
      requestExists: false,
      founderDecisionExists: false,
      harmonyDecisionExists: false,
    });
    loadSharedMock.mockRejectedValue(new Error("promotion_request_missing"));

    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("promotion-request:missing", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "promotion_request_missing",
    );

    expect(runDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(loadSharedMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when expected SHA validation fails", async () => {
    validateMock.mockImplementation(() => {
      throw new Error("target_sha_mismatch");
    });
    const { exportPersistedPromotionApprovalEvidence } = await import("../../scripts/ci/export-persisted-promotion-approval-evidence");
    await expect(exportPersistedPromotionApprovalEvidence("id", "a".repeat(40), join(tmpdir(), "x.json"))).rejects.toThrow(
      "target_sha_mismatch",
    );
  });
});
