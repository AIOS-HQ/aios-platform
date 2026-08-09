import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateLivePromotionGuard } from "../../scripts/ci/live-promotion-guard.mjs";
import { validateProductionDeploymentProvenance } from "../../scripts/ci/production-deployment-provenance.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const WORKFLOW_RUN_ID = "98765";
const WORKFLOW_RUN_ATTEMPT = "2";
const ARTIFACT_ID_NUMERIC = "12345";
const ARTIFACT_NAME = `promotion-attestation-${SHA}-${WORKFLOW_RUN_ID}`;
const WORKFLOW_REF = `AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@${SHA}#run:${WORKFLOW_RUN_ID}:attempt:${WORKFLOW_RUN_ATTEMPT}`;

function validAttestation() {
  return {
    repository: "AIOS-HQ/aios-platform",
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    targetSha: SHA,
    runtimeCertification: {
      status: "passed",
      targetSha: SHA,
      evidenceId: "runtime-evidence:123",
      artifactId: "github-artifact:22222",
      verifiedAt: "2026-08-09T10:00:00.000Z",
    },
    migrationPlanCertification: {
      status: "passed",
      targetSha: SHA,
      evidenceId: "migration-evidence:456",
      artifactId: "github-artifact:33333",
      verifiedAt: "2026-08-09T10:01:00.000Z",
    },
    founderApproval: {
      status: "approved",
      actorType: "founder",
      actorId: "founder-1",
      evidenceId: "founder-approval:789",
      approvedAt: "2026-08-09T10:02:00.000Z",
    },
    harmonyGovernanceApproval: {
      status: "approved",
      agentId: "harmony",
      evidenceId: "harmony-approval:987",
      approvedAt: "2026-08-09T10:03:00.000Z",
    },
    issuedAt: "2026-08-09T10:04:00.000Z",
    verifiedAt: "2026-08-09T10:05:00.000Z",
  };
}

function validGuardInput(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    deploymentTargetSha: SHA,
    promotionAttestation: validAttestation(),
    promotionArtifact: {
      artifactId: ARTIFACT_ID_NUMERIC,
      workflowRunId: WORKFLOW_RUN_ID,
      workflowRunAttempt: Number(WORKFLOW_RUN_ATTEMPT),
      attestedSha: SHA,
      artifactName: ARTIFACT_NAME,
      workflowRef: WORKFLOW_REF,
    },
    ...overrides,
  };
}

function validInput(overrides = {}) {
  const guardOutput = validateLivePromotionGuard(validGuardInput(), { expectedSha: SHA });

  return {
    repository: "AIOS-HQ/aios-platform",
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    targetSha: SHA,
    promotionAuthorization: {
      promotionArtifactId: ARTIFACT_ID_NUMERIC,
      promotionArtifactName: ARTIFACT_NAME,
      promotionWorkflowRunId: WORKFLOW_RUN_ID,
      promotionWorkflowRunAttempt: WORKFLOW_RUN_ATTEMPT,
      promotionWorkflowRef: WORKFLOW_REF,
    },
    livePromotionGuard: guardOutput,
    deploymentWorkflow: {
      runId: "22222",
      runAttempt: "1",
      workflowRef: `AIOS-HQ/aios-platform/.github/workflows/aios-runtime-AutoDeployTrigger-e27f8fb8-1f56-4d74-ab1a-8ab2f82f4791.yml@${SHA}#run:22222:attempt:1`,
    },
    containerImage: {
      acrName: "aioscoreacr",
      imageName: "aios-runtime",
      imageTag: SHA,
      imageDigest: `sha256:${"a".repeat(64)}`,
    },
    azureProductionTarget: {
      resourceGroup: "aios-core-rg",
      containerApp: "aios-runtime",
      deployedRevisionName: "aios-runtime--20260809-001",
      deployedAt: "2026-08-09T10:05:00.000Z",
    },
    ...overrides,
  };
}

describe("production deployment provenance contract", () => {
  it("accepts valid canonical immutable deployment provenance", () => {
    const out = validateProductionDeploymentProvenance(validInput(), { expectedSha: SHA });
    expect(out.targetSha).toBe(SHA);
    expect(out.containerImage.imageTag).toBe(SHA);
    expect(out.deploymentEvidenceId).toMatch(/^production-deployment-evidence:[0-9a-f]{64}$/);
  });

  it("consumes real M5C-1 output unchanged and validates successfully", () => {
    const guardOutput = validateLivePromotionGuard(validGuardInput(), { expectedSha: SHA });
    const out = validateProductionDeploymentProvenance(validInput({ livePromotionGuard: guardOutput }), { expectedSha: SHA });
    expect(out.livePromotionGuard.artifactId).toBe(`github-artifact:${ARTIFACT_ID_NUMERIC}`);
    expect(out.livePromotionGuard.workflowRunId).toBe(WORKFLOW_RUN_ID);
  });

  it("rejects wrong expected SHA and image tag mismatch", () => {
    expect(() => validateProductionDeploymentProvenance(validInput(), { expectedSha: "a".repeat(40) })).toThrow(/target_sha_mismatch/);
    expect(() => validateProductionDeploymentProvenance(validInput({ containerImage: { ...validInput().containerImage, imageTag: "b".repeat(40) } }), { expectedSha: SHA }))
      .toThrow(/image_tag_mismatch/);
  });

  it("rejects invalid image digest and wrong azure target identity", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({ containerImage: { ...validInput().containerImage, imageDigest: "sha256:xyz" } }), { expectedSha: SHA }))
      .toThrow(/image_digest_invalid/);
    expect(() => validateProductionDeploymentProvenance(validInput({ azureProductionTarget: { ...validInput().azureProductionTarget, resourceGroup: "wrong-rg" } }), { expectedSha: SHA }))
      .toThrow(/azure_resource_group_mismatch/);
    expect(() => validateProductionDeploymentProvenance(validInput({ azureProductionTarget: { ...validInput().azureProductionTarget, containerApp: "wrong-app" } }), { expectedSha: SHA }))
      .toThrow(/azure_container_app_mismatch/);
  });

  it("rejects promotion artifact mismatches and guard binding mismatches", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({
      promotionAuthorization: {
        ...validInput().promotionAuthorization,
        promotionArtifactName: `promotion-attestation-${SHA}-00000`,
      },
    }), { expectedSha: SHA })).toThrow(/promotion_artifact_name_mismatch/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      livePromotionGuard: {
        ...validInput().livePromotionGuard,
        artifactId: "github-artifact:99999",
      },
    }), { expectedSha: SHA })).toThrow(/live_guard_artifact_id_mismatch/);
  });

  it("rejects mutable workflow refs and invalid deployment run identity", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({
      promotionAuthorization: {
        ...validInput().promotionAuthorization,
        promotionWorkflowRef: `AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@main#run:${WORKFLOW_RUN_ID}:attempt:${WORKFLOW_RUN_ATTEMPT}`,
      },
    }), { expectedSha: SHA })).toThrow(/promotion_workflow_ref_invalid|promotion_workflow_ref_head_sha_invalid/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      deploymentWorkflow: {
        ...validInput().deploymentWorkflow,
        runAttempt: "0",
      },
    }), { expectedSha: SHA })).toThrow(/deployment_run_attempt_invalid/);
  });

  it("fails closed on guard target sha mismatch, invalid verifiedAt, or ok not true", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({
      livePromotionGuard: {
        ...validInput().livePromotionGuard,
        deploymentTargetSha: "a".repeat(40),
      },
    }), { expectedSha: SHA })).toThrow(/live_guard_target_sha_mismatch/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      livePromotionGuard: {
        ...validInput().livePromotionGuard,
        verifiedAt: "not-a-date",
      },
    }), { expectedSha: SHA })).toThrow(/live_guard_verified_at_invalid/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      livePromotionGuard: {
        ...validInput().livePromotionGuard,
        ok: false,
      },
    }), { expectedSha: SHA })).toThrow(/live_guard_not_ok/);
  });

  it("rejects sensitive keys/values recursively", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({ secrets: { apiToken: "abc" } }), { expectedSha: SHA }))
      .toThrow(/sensitive_key_rejected/);
    expect(() => validateProductionDeploymentProvenance(validInput({ note: "postgres://user:pass@host/db" }), { expectedSha: SHA }))
      .toThrow(/sensitive_value_rejected/);
  });

  it("produces deterministic deploymentEvidenceId", () => {
    const first = validateProductionDeploymentProvenance(validInput(), { expectedSha: SHA });
    const second = validateProductionDeploymentProvenance(validInput(), { expectedSha: SHA });
    expect(first.deploymentEvidenceId).toBe(second.deploymentEvidenceId);

    const changed = validateProductionDeploymentProvenance(validInput({ containerImage: { ...validInput().containerImage, imageDigest: `sha256:${"b".repeat(64)}` } }), { expectedSha: SHA });
    expect(changed.deploymentEvidenceId).not.toBe(first.deploymentEvidenceId);
  });

  it("runs real CLI success and fail-closed behavior", () => {
    const tmp = mkdtempSync(join(tmpdir(), "production-deployment-provenance-"));
    try {
      const inputPath = join(tmp, "input.json");
      writeFileSync(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");
      const cliPath = resolve("scripts/ci/production-deployment-provenance.mjs");

      const success = spawnSync(process.execPath, [cliPath, "validate", inputPath, SHA], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      const out = JSON.parse(success.stdout);
      expect(out.targetSha).toBe(SHA);
      expect(out.containerImage.imageTag).toBe(SHA);

      const fail = spawnSync(process.execPath, [cliPath, "validate", inputPath, "a".repeat(40)], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(fail.status).not.toBe(0);
      expect(fail.stderr).toContain("target_sha_mismatch");
      expect(fail.stderr).not.toContain("guardEvidenceId");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
