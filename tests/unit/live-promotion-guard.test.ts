import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateLivePromotionGuard } from "../../scripts/ci/live-promotion-guard.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validAttestation(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    targetSha: SHA,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    runtimeCertification: {
      status: "passed",
      targetSha: SHA,
      evidenceId: "runtime:abc123",
      artifactId: "github-artifact:22222",
      verifiedAt: "2026-08-08T10:00:00.000Z",
    },
    migrationPlanCertification: {
      status: "passed",
      targetSha: SHA,
      evidenceId: "migration:def456",
      artifactId: "github-artifact:44444",
      verifiedAt: "2026-08-08T10:01:00.000Z",
    },
    founderApproval: {
      status: "approved",
      actorType: "founder",
      actorId: "founder_1",
      evidenceId: "founder:approve:789",
      approvedAt: "2026-08-08T10:02:00.000Z",
    },
    harmonyGovernanceApproval: {
      status: "approved",
      agentId: "harmony",
      evidenceId: "harmony:approve:987",
      approvedAt: "2026-08-08T10:03:00.000Z",
    },
    issuedAt: "2026-08-08T10:04:00.000Z",
    verifiedAt: "2026-08-08T10:05:00.000Z",
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    deploymentTargetSha: SHA,
    promotionAttestation: validAttestation(),
    promotionArtifact: {
      artifactId: "55555",
      artifactName: `promotion-attestation-${SHA}-77777`,
      workflowRunId: "77777",
      workflowRunAttempt: 1,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/main#run:77777:attempt:1",
      attestedSha: SHA,
    },
    ...overrides,
  };
}

describe("live promotion guard", () => {
  it("accepts canonical valid promotion attestation and immutable metadata", () => {
    const out = validateLivePromotionGuard(validInput(), { expectedSha: SHA });
    expect(out.ok).toBe(true);
    expect(out.repository).toBe("AIOS-HQ/aios-platform");
    expect(out.deploymentTargetSha).toBe(SHA);
    expect(out.sourceEnvironment).toBe("staging");
    expect(out.targetEnvironment).toBe("production");
    expect(out.promotionAuthorized).toBe(true);
  });

  it("fails closed for wrong repository / malformed deployment SHA / SHA mismatch", () => {
    expect(() => validateLivePromotionGuard(validInput({ repository: "evil/repo" }), { expectedSha: SHA })).toThrow(/repository_mismatch/);
    expect(() => validateLivePromotionGuard(validInput({ deploymentTargetSha: "deadbeef" }), { expectedSha: SHA })).toThrow(/deployment_target_sha_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ deploymentTargetSha: "a".repeat(40) }), { expectedSha: SHA })).toThrow(/deployment_target_sha_mismatch/);
  });

  it("fails closed when attestation violates staging->production contract", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ sourceEnvironment: "preview" }) }), { expectedSha: SHA })).toThrow(/source_environment_mismatch/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ targetEnvironment: "staging" }) }), { expectedSha: SHA })).toThrow(/target_environment_mismatch/);
  });

  it("fails closed for runtime and migration certification invalid/mismatched", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ runtimeCertification: { ...validAttestation().runtimeCertification, status: "failed" } }) }), { expectedSha: SHA }))
      .toThrow(/runtime_certification_failed/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ runtimeCertification: { ...validAttestation().runtimeCertification, targetSha: "a".repeat(40) } }) }), { expectedSha: SHA }))
      .toThrow(/runtime_target_sha_mismatch/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ migrationPlanCertification: { ...validAttestation().migrationPlanCertification, status: "failed" } }) }), { expectedSha: SHA }))
      .toThrow(/migration_plan_certification_failed/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ migrationPlanCertification: { ...validAttestation().migrationPlanCertification, targetSha: "a".repeat(40) } }) }), { expectedSha: SHA }))
      .toThrow(/migration_target_sha_mismatch/);
  });

  it("fails closed for missing/invalid Founder and Harmony approvals", () => {
    const withoutFounder = validAttestation();
    delete withoutFounder.founderApproval;
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: withoutFounder }), { expectedSha: SHA })).toThrow(/founder_approval_missing/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ founderApproval: { ...validAttestation().founderApproval, status: "pending" } }) }), { expectedSha: SHA }))
      .toThrow(/founder_approval_missing/);

    const withoutHarmony = validAttestation();
    delete withoutHarmony.harmonyGovernanceApproval;
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: withoutHarmony }), { expectedSha: SHA })).toThrow(/governance_approval_missing/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ harmonyGovernanceApproval: { ...validAttestation().harmonyGovernanceApproval, status: "pending" } }) }), { expectedSha: SHA }))
      .toThrow(/governance_approval_missing/);
  });

  it("fails closed for malformed timestamps in attestation", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: validAttestation({ issuedAt: "not-a-date" }) }), { expectedSha: SHA }))
      .toThrow(/issued_at_invalid/);
  });

  it("accepts canonical branch ref only with exact immutable run binding", () => {
    const out = validateLivePromotionGuard(validInput(), { expectedSha: SHA });
    expect(out.ok).toBe(true);
  });

  it("fails closed for bare mutable workflow refs and wrong run bindings", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/main",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);

    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/release",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);

    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "workflow@HEAD",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);

    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "workflow@latest",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);

    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/main#run:99999:attempt:1",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);

    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/main#run:77777:attempt:2",
    } }), { expectedSha: SHA })).toThrow(/workflow_ref_mutable_selector|workflow_ref_run_binding_missing/);
  });

  it("fails closed for exact artifact-name format violations and substring coincidence", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, artifactId: "0" } }), { expectedSha: SHA }))
      .toThrow(/artifact_id_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, workflowRunId: "0" } }), { expectedSha: SHA }))
      .toThrow(/workflow_run_id_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, workflowRunAttempt: 0 } }), { expectedSha: SHA }))
      .toThrow(/workflow_run_attempt_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, attestedSha: "a".repeat(40) } }), { expectedSha: SHA }))
      .toThrow(/artifact_attested_sha_mismatch/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, artifactName: `promotion-attestation-${SHA}-99999` } }), { expectedSha: SHA }))
      .toThrow(/artifact_name_run_id_missing|artifact_name_format_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, artifactName: `promotion-attestation-${SHA}` } }), { expectedSha: SHA }))
      .toThrow(/artifact_name_run_id_missing|artifact_name_format_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, artifactName: `promotion-attestation-${SHA}-77777-latest` } }), { expectedSha: SHA }))
      .toThrow(/artifact_name_mutable_alias|artifact_name_format_invalid/);
    expect(() => validateLivePromotionGuard(validInput({ promotionArtifact: { ...validInput().promotionArtifact, artifactName: `promotion-attestation-${"77777"}-deadbeefdeadbeefdeadbeefdeadbeefdeadbeef` } }), { expectedSha: SHA }))
      .toThrow(/artifact_name_sha_missing|artifact_name_format_invalid/);
  });

  it("fails closed for sensitive keys and values", () => {
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: { ...validAttestation(), token: "secret" } }), { expectedSha: SHA }))
      .toThrow(/sensitive_key_rejected/);
    expect(() => validateLivePromotionGuard(validInput({ promotionAttestation: { ...validAttestation(), leak: "postgres://user:pw@host/db" } }), { expectedSha: SHA }))
      .toThrow(/sensitive_value_rejected/);
  });

  it("produces deterministic guardEvidenceId for same immutable inputs", () => {
    const first = validateLivePromotionGuard(validInput(), { expectedSha: SHA });
    const second = validateLivePromotionGuard(validInput(), { expectedSha: SHA });
    expect(first.guardEvidenceId).toMatch(/^guard:[0-9a-f]{64}$/);
    expect(first.guardEvidenceId).toBe(second.guardEvidenceId);
  });

  it("changes guardEvidenceId when immutable artifact/run identity changes", () => {
    const base = validateLivePromotionGuard(validInput(), { expectedSha: SHA });
    const changed = validateLivePromotionGuard(validInput({ promotionArtifact: {
      ...validInput().promotionArtifact,
      workflowRunAttempt: 2,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/live-promotion.yml@refs/heads/main#run:77777:attempt:2",
    } }), { expectedSha: SHA });
    expect(base.guardEvidenceId).not.toBe(changed.guardEvidenceId);
  });

  it("executes real CLI validate success and fail-closed SHA mismatch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "live-promotion-guard-"));
    try {
      const payloadPath = join(tmp, "input.json");
      writeFileSync(payloadPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");

      const cliPath = resolve("scripts/ci/live-promotion-guard.mjs");
      const success = spawnSync(process.execPath, [cliPath, "validate", payloadPath, SHA], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      const out = JSON.parse(success.stdout);
      expect(out.ok).toBe(true);
      expect(out.deploymentTargetSha).toBe(SHA);
      expect(out.sourceEnvironment).toBe("staging");
      expect(out.targetEnvironment).toBe("production");

      const mismatch = spawnSync(process.execPath, [cliPath, "validate", payloadPath, "a".repeat(40)], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(mismatch.status).not.toBe(0);
      expect(mismatch.stderr).toContain("deployment_target_sha_mismatch");
      expect(mismatch.stderr).not.toContain("promotionAttestation");
      expect(mismatch.stderr).not.toContain("runtimeCertification");
      expect(mismatch.stderr).not.toContain("migrationPlanCertification");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
