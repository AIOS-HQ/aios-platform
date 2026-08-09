import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateProductionPostLiveEvidence } from "../../scripts/ci/production-post-live-evidence.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const DEPLOYMENT_EVIDENCE_ID = `production-deployment-evidence:${"a".repeat(64)}`;
const CONDITION_ID = "b".repeat(64);
const OUTCOME_ID = "c".repeat(64);
const COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
];

function foundation(overrides = {}) {
  return COMPONENTS.map((component, idx) => ({
    component,
    status: "healthy",
    evidenceType: idx % 2 === 0 ? "live_runtime_proof" : "authenticated_runtime_proof",
    details: { liveProbeAttempted: true },
    runtimeConditionId: CONDITION_ID,
    latencyBucket: "under_1s",
    ...overrides,
  }));
}

function validInput(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    environment: "production",
    targetSha: SHA,
    productionDeployment: {
      deploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
      targetSha: SHA,
      imageDigest: `sha256:${"d".repeat(64)}`,
      imageTag: SHA,
      deployedRevisionName: "aios-runtime--prod-001",
      deployedAt: "2026-08-09T10:00:00.000Z",
    },
    authenticatedRuntime: {
      authenticatedSession: true,
      founderAuthorized: true,
      originMatched: true,
    },
    operationalRuntimeSummary: {
      componentCount: 6,
      healthy: 6,
      degraded: 0,
      blocked: 0,
      unavailable: 0,
      unknown: 0,
      runtimeCondition: {
        conditionId: CONDITION_ID,
      },
      outcomeId: OUTCOME_ID,
    },
    operationalRuntimeFoundation: foundation(),
    verifiedAt: "2026-08-09T10:05:00.000Z",
    ...overrides,
  };
}

describe("production post-live evidence contract", () => {
  it("accepts fully healthy valid production post-live evidence", () => {
    const out = validateProductionPostLiveEvidence(validInput(), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    });
    expect(out.targetSha).toBe(SHA);
    expect(out.postLiveEvidenceId).toMatch(/^production-post-live-evidence:[0-9a-f]{64}$/);
  });

  it("rejects wrong target SHA and wrong deploymentEvidenceId", () => {
    expect(() => validateProductionPostLiveEvidence(validInput(), {
      expectedSha: "a".repeat(40),
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/target_sha_mismatch/);

    expect(() => validateProductionPostLiveEvidence(validInput(), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: `production-deployment-evidence:${"b".repeat(64)}`,
    })).toThrow(/deployment_evidence_id_mismatch/);
  });

  it("rejects image tag mismatch and invalid image digest", () => {
    expect(() => validateProductionPostLiveEvidence(validInput({
      productionDeployment: {
        ...validInput().productionDeployment,
        imageTag: "b".repeat(40),
      },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/deployment_image_tag_mismatch/);

    expect(() => validateProductionPostLiveEvidence(validInput({
      productionDeployment: {
        ...validInput().productionDeployment,
        imageDigest: "sha256:xyz",
      },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/deployment_image_digest_invalid/);
  });

  it("rejects verifiedAt before deployedAt", () => {
    expect(() => validateProductionPostLiveEvidence(validInput({ verifiedAt: "2026-08-09T09:59:59.000Z" }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/verified_before_deployed/);
  });

  it("rejects missing/duplicate required runtime components", () => {
    expect(() => validateProductionPostLiveEvidence(validInput({
      operationalRuntimeFoundation: foundation().slice(1),
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/runtime_foundation_count_invalid|runtime_component_missing/);

    const dup = foundation();
    dup[5].component = dup[0].component;
    expect(() => validateProductionPostLiveEvidence(validInput({ operationalRuntimeFoundation: dup }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/runtime_component_duplicate/);
  });

  it("rejects degraded/blocked/unavailable/unknown summary or component state", () => {
    expect(() => validateProductionPostLiveEvidence(validInput({
      operationalRuntimeSummary: { ...validInput().operationalRuntimeSummary, degraded: 1 },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/runtime_degraded_count_invalid/);

    expect(() => validateProductionPostLiveEvidence(validInput({
      operationalRuntimeSummary: { ...validInput().operationalRuntimeSummary, blocked: 1 },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/runtime_blocked_count_invalid/);

    expect(() => validateProductionPostLiveEvidence(validInput({
      operationalRuntimeSummary: { ...validInput().operationalRuntimeSummary, unavailable: 1 },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/runtime_unavailable_count_invalid/);

    expect(() => validateProductionPostLiveEvidence(validInput({
      operationalRuntimeSummary: { ...validInput().operationalRuntimeSummary, unknown: 1 },
    }), { expectedSha: SHA, expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID })).toThrow(/runtime_unknown_count_invalid/);

    const unhealthy = foundation();
    unhealthy[0].status = "degraded";
    expect(() => validateProductionPostLiveEvidence(validInput({ operationalRuntimeFoundation: unhealthy }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/runtime_component_not_healthy/);
  });

  it("rejects probe-not-attempted and runtimeCondition mismatch", () => {
    const noProbe = foundation();
    noProbe[0].details.liveProbeAttempted = false;
    expect(() => validateProductionPostLiveEvidence(validInput({ operationalRuntimeFoundation: noProbe }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/runtime_probe_not_attempted/);

    const mismatch = foundation();
    mismatch[0].runtimeConditionId = "e".repeat(64);
    expect(() => validateProductionPostLiveEvidence(validInput({ operationalRuntimeFoundation: mismatch }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/runtime_condition_id_mismatch/);
  });

  it("rejects sensitive keys/values recursively", () => {
    expect(() => validateProductionPostLiveEvidence(validInput({ token: "secret" }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/sensitive_key_rejected/);

    expect(() => validateProductionPostLiveEvidence(validInput({ note: "postgres://user:pass@host/db" }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    })).toThrow(/sensitive_value_rejected/);
  });

  it("produces deterministic postLiveEvidenceId and changes with verifiedAt/imageDigest", () => {
    const first = validateProductionPostLiveEvidence(validInput(), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    });
    const second = validateProductionPostLiveEvidence(validInput(), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    });
    expect(first.postLiveEvidenceId).toBe(second.postLiveEvidenceId);

    const verifiedAtChanged = validateProductionPostLiveEvidence(validInput({ verifiedAt: "2026-08-09T10:05:01.000Z" }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    });
    expect(verifiedAtChanged.postLiveEvidenceId).not.toBe(first.postLiveEvidenceId);

    const digestChanged = validateProductionPostLiveEvidence(validInput({
      productionDeployment: {
        ...validInput().productionDeployment,
        imageDigest: `sha256:${"f".repeat(64)}`,
      },
    }), {
      expectedSha: SHA,
      expectedDeploymentEvidenceId: DEPLOYMENT_EVIDENCE_ID,
    });
    expect(digestChanged.postLiveEvidenceId).not.toBe(first.postLiveEvidenceId);
  });

  it("runs real CLI success and fail-closed behavior", () => {
    const tmp = mkdtempSync(join(tmpdir(), "production-post-live-evidence-"));
    try {
      const inputPath = join(tmp, "input.json");
      writeFileSync(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");
      const cliPath = resolve("scripts/ci/production-post-live-evidence.mjs");

      const success = spawnSync(process.execPath, [cliPath, "validate", inputPath, SHA, DEPLOYMENT_EVIDENCE_ID], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      const out = JSON.parse(success.stdout);
      expect(out.targetSha).toBe(SHA);
      expect(out.productionDeployment.deploymentEvidenceId).toBe(DEPLOYMENT_EVIDENCE_ID);

      const fail = spawnSync(process.execPath, [cliPath, "validate", inputPath, "a".repeat(40), DEPLOYMENT_EVIDENCE_ID], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(fail.status).not.toBe(0);
      expect(fail.stderr).toContain("target_sha_mismatch");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
