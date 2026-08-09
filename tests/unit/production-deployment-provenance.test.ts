import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateProductionDeploymentProvenance } from "../../scripts/ci/production-deployment-provenance.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validInput(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    targetSha: SHA,
    promotionAuthorization: {
      promotionArtifactId: "12345",
      promotionArtifactName: `promotion-attestation-${SHA}-98765`,
      promotionWorkflowRunId: "98765",
      promotionWorkflowRunAttempt: "2",
      promotionWorkflowRef: `AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@${SHA}#run:98765:attempt:2`,
    },
    livePromotionGuard: {
      promotionAuthorized: true,
      guardEvidenceId: "live-guard-evidence:abc123",
      guardVerifiedAt: "2026-08-09T10:00:00.000Z",
      promotionArtifactId: "12345",
      workflowRunId: "98765",
      workflowRunAttempt: "2",
      attestedSha: SHA,
      artifactName: `promotion-attestation-${SHA}-98765`,
      workflowRef: `AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@${SHA}#run:98765:attempt:2`,
    },
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

  it("rejects promotion artifact mismatches and live-guard binding mismatches", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({
      promotionAuthorization: {
        ...validInput().promotionAuthorization,
        promotionArtifactName: `promotion-attestation-${SHA}-00000`,
      },
    }), { expectedSha: SHA })).toThrow(/promotion_artifact_name_mismatch/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      livePromotionGuard: {
        ...validInput().livePromotionGuard,
        promotionArtifactId: "99999",
      },
    }), { expectedSha: SHA })).toThrow(/live_guard_artifact_id_mismatch/);
  });

  it("rejects mutable workflow refs and invalid deployment run identity", () => {
    expect(() => validateProductionDeploymentProvenance(validInput({
      promotionAuthorization: {
        ...validInput().promotionAuthorization,
        promotionWorkflowRef: "AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@main#run:98765:attempt:2",
      },
    }), { expectedSha: SHA })).toThrow(/promotion_workflow_ref_invalid|promotion_workflow_ref_head_sha_invalid/);

    expect(() => validateProductionDeploymentProvenance(validInput({
      deploymentWorkflow: {
        ...validInput().deploymentWorkflow,
        runAttempt: "0",
      },
    }), { expectedSha: SHA })).toThrow(/deployment_run_attempt_invalid/);
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
