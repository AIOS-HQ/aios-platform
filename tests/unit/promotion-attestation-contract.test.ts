import { describe, expect, it } from "vitest";
import { validatePromotionAttestation } from "../../scripts/ci/promotion-attestation-contract.mjs";

const BASE_SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validAttestation() {
  return {
    repository: "AIOS-HQ/aios-platform",
    targetSha: BASE_SHA,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    runtimeCertification: {
      status: "passed",
      targetSha: BASE_SHA,
      evidenceId: "runtime-evidence-001",
      artifactId: "runtime-artifact-001",
      verifiedAt: "2026-08-08T10:00:00.000Z",
    },
    migrationPlanCertification: {
      status: "passed",
      targetSha: BASE_SHA,
      evidenceId: "migration-evidence-001",
      artifactId: "migration-artifact-001",
      verifiedAt: "2026-08-08T10:02:00.000Z",
    },
    founderApproval: {
      status: "approved",
      actorType: "founder",
      actorId: "11111111-1111-1111-1111-111111111111",
      evidenceId: "founder-evidence-001",
      approvedAt: "2026-08-08T10:03:00.000Z",
    },
    harmonyGovernanceApproval: {
      status: "approved",
      agentId: "harmony",
      evidenceId: "governance-evidence-001",
      approvedAt: "2026-08-08T10:04:00.000Z",
    },
    issuedAt: "2026-08-08T10:05:00.000Z",
    verifiedAt: "2026-08-08T10:06:00.000Z",
  };
}

describe("promotion attestation contract", () => {
  it("accepts a canonical staging-to-production attestation bound to exact SHA", () => {
    const attestation = validAttestation();
    const result = validatePromotionAttestation(attestation, { expectedSha: BASE_SHA });
    expect(result.ok).toBe(true);
    expect(result.targetSha).toBe(BASE_SHA);
    expect(result.sourceEnvironment).toBe("staging");
    expect(result.targetEnvironment).toBe("production");
  });

  it("fails closed on repository/environment/SHA mismatches", () => {
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), repository: "other/repo" }),
    ).toThrow(/repository_mismatch/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), sourceEnvironment: "production" }),
    ).toThrow(/source_environment_mismatch/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), targetEnvironment: "staging" }),
    ).toThrow(/target_environment_mismatch/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), targetSha: "deadbeef" }),
    ).toThrow(/target_sha_invalid/);
    expect(() =>
      validatePromotionAttestation(validAttestation(), { expectedSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    ).toThrow(/target_sha_mismatch/);
  });

  it("fails closed on failed or mismatched certification evidence", () => {
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), runtimeCertification: { ...validAttestation().runtimeCertification, status: "failed" } }),
    ).toThrow(/runtime_certification_failed/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), migrationPlanCertification: { ...validAttestation().migrationPlanCertification, targetSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } }),
    ).toThrow(/migration_target_sha_mismatch/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), runtimeCertification: { ...validAttestation().runtimeCertification, artifactId: "latest-runtime" } }),
    ).toThrow(/runtime_artifact_invalid/);
  });

  it("fails closed on missing founder/governance approvals", () => {
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), founderApproval: { ...validAttestation().founderApproval, status: "pending" } }),
    ).toThrow(/founder_approval_missing/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), harmonyGovernanceApproval: { ...validAttestation().harmonyGovernanceApproval, agentId: "other" } }),
    ).toThrow(/governance_agent_invalid/);
  });

  it("fails closed on malformed or inconsistent timestamps", () => {
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), issuedAt: "not-a-time" }),
    ).toThrow(/issued_at_invalid/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), verifiedAt: "2026-08-08T09:00:00.000Z" }),
    ).toThrow(/verified_before_issued/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), founderApproval: { ...validAttestation().founderApproval, approvedAt: "" } }),
    ).toThrow(/founder_approved_at_invalid/);
  });

  it("rejects sensitive keys and infrastructure values", () => {
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), secrets: { apiToken: "abc" } }),
    ).toThrow(/sensitive_key_rejected/);
    expect(() =>
      validatePromotionAttestation({ ...validAttestation(), note: "postgres://user:pass@host/db" }),
    ).toThrow(/sensitive_value_rejected/);
  });
});
