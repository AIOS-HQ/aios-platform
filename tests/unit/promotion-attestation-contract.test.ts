import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validatePromotionAttestation } from "../../scripts/ci/promotion-attestation-contract.mjs";

const BASE_SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const GOVERNED_PREVIEW_WAIVER_REASON = "preview_certification_contract_incompatibility";

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

function validWaivedAttestation() {
  return {
    ...validAttestation(),
    runtimeCertification: {
      status: "waived",
      targetSha: BASE_SHA,
      evidenceId: null,
      artifactId: null,
      verifiedAt: null,
      waiver: true,
      waiverReason: GOVERNED_PREVIEW_WAIVER_REASON,
    },
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

  it("accepts governed runtime waiver attestation when waiver contract is exact", () => {
    const attestation = validWaivedAttestation();
    const result = validatePromotionAttestation(attestation, { expectedSha: BASE_SHA });
    expect(result.ok).toBe(true);
    expect(result.targetSha).toBe(BASE_SHA);
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

  it("fails closed on mixed waiver/runtime states", () => {
    expect(() =>
      validatePromotionAttestation({
        ...validWaivedAttestation(),
        runtimeCertification: { ...validWaivedAttestation().runtimeCertification, evidenceId: "runtime-evidence-001" },
      }),
    ).toThrow(/runtime_evidence_invalid/);

    expect(() =>
      validatePromotionAttestation({
        ...validWaivedAttestation(),
        runtimeCertification: { ...validWaivedAttestation().runtimeCertification, verifiedAt: "2026-08-08T10:00:00.000Z" },
      }),
    ).toThrow(/runtime_verified_at_invalid/);

    expect(() =>
      validatePromotionAttestation({
        ...validWaivedAttestation(),
        runtimeCertification: { ...validWaivedAttestation().runtimeCertification, waiverReason: "wrong_reason" },
      }),
    ).toThrow(/runtime_waiver_reason_invalid/);

    expect(() =>
      validatePromotionAttestation({
        ...validAttestation(),
        runtimeCertification: { ...validAttestation().runtimeCertification, waiver: true },
      }),
    ).toThrow(/runtime_waiver_flag_unexpected/);
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

  it("validates a promotion attestation via real node CLI execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "m5a-attest-"));
    const payloadPath = join(dir, "attestation.json");
    writeFileSync(payloadPath, JSON.stringify(validAttestation()), "utf8");

    const output = execFileSync("node", ["scripts/ci/promotion-attestation-contract.mjs", "validate", payloadPath, BASE_SHA], {
      encoding: "utf8",
    });
    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(result.targetSha).toBe(BASE_SHA);
    expect(result.sourceEnvironment).toBe("staging");
    expect(result.targetEnvironment).toBe("production");
  });

  it("fails closed in CLI mode when expected SHA mismatches", () => {
    const dir = mkdtempSync(join(tmpdir(), "m5a-attest-mismatch-"));
    const payloadPath = join(dir, "attestation.json");
    writeFileSync(payloadPath, JSON.stringify(validAttestation()), "utf8");

    expect(() =>
      execFileSync("node", ["scripts/ci/promotion-attestation-contract.mjs", "validate", payloadPath, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();

    const persisted = JSON.parse(readFileSync(payloadPath, "utf8"));
    expect(persisted.targetSha).toBe(BASE_SHA);
  });
});
