import { describe, expect, it } from "vitest";
import { composeStagingPromotionEvidence } from "../../scripts/ci/staging-promotion-evidence.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const CONDITION_ID = "b".repeat(64);
const OUTCOME_ID = "c".repeat(64);
const REQUIRED_COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
];

function validRuntimeSummary(overrides = {}) {
  return {
    componentCount: 6,
    healthy: 1,
    degraded: 5,
    blocked: 0,
    unavailable: 0,
    unknown: 0,
    runtimeCondition: {
      conditionId: CONDITION_ID,
      logicVersion: "operational-live-probe-v1",
    },
    outcomeId: OUTCOME_ID,
    ...overrides,
  };
}

function validRuntimeFoundation(perItemOverrides = {}) {
  return REQUIRED_COMPONENTS.map((component, index) => ({
    component,
    status: index === 0 ? "healthy" : "degraded",
    evidenceType: index === 0 ? "live_runtime_proof" : "authenticated_runtime_proof",
    observedAt: "2026-08-08T10:00:00.000Z",
    observedBy: `operational_runtime.probe.${component}`,
    confidence: index === 0 ? 0.95 : 0.85,
    details: { scope: "operational_runtime", liveProbeRequired: true, liveProbeAttempted: true },
    runtimeConditionId: CONDITION_ID,
    latencyBucket: "under_1s",
    safeErrorCode: null,
    safeMessage: `${component}_probe_succeeded`,
    ...perItemOverrides,
  }));
}

function validRuntimeArtifact(overrides = {}) {
  return {
    certification: "operational-runtime-live",
    pr: 512,
    headSha: SHA,
    previewUrlClassification: "approved_vercel_preview",
    authenticatedSession: true,
    founderAuthorized: true,
    originMatched: true,
    deployment: {
      commitSha: SHA,
      environment: "preview",
      buildTimestamp: null,
      requestTimestamp: "2026-08-08T10:00:00.000Z",
      vercelDeploymentId: "dpl_safe_preview",
    },
    operationalRuntimeSummary: validRuntimeSummary(),
    operationalRuntimeFoundation: validRuntimeFoundation(),
    verifiedAt: "2026-08-08T10:00:00.000Z",
    result: "passed",
    ...overrides,
  };
}

function validMigrationArtifact(overrides = {}) {
  return {
    certification: "supabase-staging-migration-plan",
    repository: "AIOS-HQ/aios-platform",
    targetSha: SHA,
    environment: "staging",
    result: "passed",
    mode: "dry_run",
    databaseChangesApplied: false,
    completeHistory: true,
    migrationCount: 58,
    trustedControlSha: SHA,
    validatorSha256: "a".repeat(64),
    workflowRun: {
      runId: "123456",
      runAttempt: 1,
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/supabase-staging-migration-plan.yml@refs/heads/main",
    },
    verifiedAt: "2026-08-08T10:01:00.000Z",
    ...overrides,
  };
}

function validInput(overrides = {}) {
  return {
    repository: "AIOS-HQ/aios-platform",
    runtimeArtifact: validRuntimeArtifact(),
    migrationArtifact: validMigrationArtifact(),
    runtimeArtifactMeta: {
      artifactId: "22222",
      runId: "33333",
      runAttempt: 1,
      artifactName: `operational-runtime-live-${SHA}-33333`,
      waiver: false,
      previewRuntimeCertificationCompleted: true,
    },
    migrationArtifactMeta: {
      artifactId: "44444",
      runId: "123456",
      runAttempt: 1,
      artifactName: `supabase-staging-migration-plan-${SHA}-123456`,
    },
    ...overrides,
  };
}

describe("staging promotion evidence composer", () => {
  it("composes canonical runtime artifact without repository field when top-level repository is valid", () => {
    const runtime = validRuntimeArtifact();
    expect(Object.prototype.hasOwnProperty.call(runtime, "repository")).toBe(false);
    const composed = composeStagingPromotionEvidence(validInput({ runtimeArtifact: runtime }), { expectedTargetSha: SHA });
    expect(composed.repository).toBe("AIOS-HQ/aios-platform");
    expect(composed.targetSha).toBe(SHA);
    expect(composed.sourceEnvironment).toBe("staging");
    expect(composed.targetEnvironment).toBe("production");
  });

  it("includes canonical six runtime components with certifiable summary totals and identities", () => {
    const runtime = validRuntimeArtifact();
    expect(runtime.operationalRuntimeSummary).toMatchObject({
      componentCount: 6,
      healthy: 1,
      degraded: 5,
      blocked: 0,
      unavailable: 0,
      unknown: 0,
      runtimeCondition: { conditionId: CONDITION_ID, logicVersion: "operational-live-probe-v1" },
      outcomeId: OUTCOME_ID,
    });
    expect(runtime.operationalRuntimeFoundation.map((item) => item.component)).toEqual(REQUIRED_COMPONENTS);
    expect(runtime.operationalRuntimeFoundation.every((item) => item.runtimeConditionId === CONDITION_ID)).toBe(true);
    expect(runtime.operationalRuntimeFoundation.every((item) => item.details.liveProbeAttempted === true)).toBe(true);
    expect(runtime.operationalRuntimeFoundation.every((item) => ["live_runtime_proof", "authenticated_runtime_proof"].includes(item.evidenceType))).toBe(true);
  });

  it("keeps runtime deployment environment preview while source environment is staging", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect(composed.sourceEnvironment).toBe("staging");
    expect(composed.runtimeCertification.deploymentEnvironment).toBe("preview");
    expect(composed.runtimeCertification.certificationSourceEnvironment).toBe("staging");
  });

  it("retains immutable artifact and run identities", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect(composed.runtimeCertification.artifactId).toBe("github-artifact:22222");
    expect(composed.migrationPlanCertification.artifactId).toBe("github-artifact:44444");
    expect(composed.runtimeCertification.workflowRun).toEqual({
      runId: "33333",
      runAttempt: 1,
      artifactName: `operational-runtime-live-${SHA}-33333`,
    });
    expect(composed.migrationPlanCertification.workflowRun).toEqual({
      runId: "123456",
      runAttempt: 1,
      artifactName: `supabase-staging-migration-plan-${SHA}-123456`,
    });
  });

  it("normalizes runtime and migration evidence to M5A-required fields", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect(composed.runtimeCertification).toMatchObject({
      status: "passed",
      targetSha: SHA,
      evidenceId: expect.stringContaining(`:${OUTCOME_ID}:${CONDITION_ID}:`),
      artifactId: expect.stringMatching(/^github-artifact:[1-9][0-9]*$/),
      verifiedAt: expect.any(String),
    });
    expect(composed.migrationPlanCertification).toMatchObject({
      status: "passed",
      targetSha: SHA,
      evidenceId: expect.stringMatching(/^migration:[0-9a-f]{64}$/),
      artifactId: expect.stringMatching(/^github-artifact:[1-9][0-9]*$/),
      verifiedAt: expect.any(String),
    });
  });

  it("fails closed for wrong top-level repository", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ repository: "evil/repo" }), { expectedTargetSha: SHA }))
      .toThrow(/repository_mismatch/);
  });

  it("fails closed for runtime summary/foundation contract violations", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: undefined }) }), { expectedTargetSha: SHA }))
      .toThrow(/invalid_operational_summary/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: validRuntimeSummary({ blocked: 1, healthy: 0, degraded: 5 }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_runtime_not_certifiable/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: validRuntimeSummary({ unavailable: 1, healthy: 0, degraded: 5 }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_runtime_not_certifiable/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: validRuntimeSummary({ unknown: 1, healthy: 0, degraded: 5 }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_runtime_not_certifiable/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: validRuntimeSummary({ runtimeCondition: { conditionId: "bad", logicVersion: "operational-live-probe-v1" } }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/invalid_runtime_condition_id/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeSummary: validRuntimeSummary({ outcomeId: "bad" }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/invalid_runtime_outcome_id/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: undefined }) }), { expectedTargetSha: SHA }))
      .toThrow(/missing_operational_runtime_foundation/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: [...validRuntimeFoundation(), validRuntimeFoundation()[0]] }) }), { expectedTargetSha: SHA }))
      .toThrow(/missing_operational_runtime_foundation|invalid_operational_component/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: validRuntimeFoundation({ runtimeConditionId: "d".repeat(64) }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_condition_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: validRuntimeFoundation({ evidenceType: "other" }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_component_missing_live_evidence/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: validRuntimeFoundation({ details: { scope: "operational_runtime", liveProbeRequired: true, liveProbeAttempted: false } }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_probe_not_attempted/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ operationalRuntimeFoundation: validRuntimeFoundation({ latencyBucket: null }) }) }), { expectedTargetSha: SHA }))
      .toThrow(/operational_latency_missing/);
  });

  it("fails closed for runtime preview/identity/deployment/sha checks", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ previewUrlClassification: "wrong" }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_preview_classification_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ pr: 0 }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_pr_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ deployment: { commitSha: SHA, environment: "production", vercelDeploymentId: "dpl_safe_preview", buildTimestamp: null, requestTimestamp: "2026-08-08T10:00:00.000Z" } }) }), { expectedTargetSha: SHA }))
      .toThrow(/wrong_deployment_environment/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ headSha: "f".repeat(40), deployment: { commitSha: "f".repeat(40), environment: "preview", vercelDeploymentId: "dpl_safe_preview", buildTimestamp: null, requestTimestamp: "2026-08-08T10:00:00.000Z" } }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_target_sha_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ result: "failed" }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_result_not_passed/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ authenticatedSession: false }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_unauthenticated/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ founderAuthorized: false }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_founder_unauthorized/);
  });

  it("fails closed for migration target/run identity mismatch and sensitive payloads", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ targetSha: "b".repeat(40) }) }), { expectedTargetSha: SHA }))
      .toThrow(/target_sha_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifactMeta: { artifactId: "44444", runId: "999", runAttempt: 1, artifactName: `supabase-staging-migration-plan-${SHA}-999` } }), { expectedTargetSha: SHA }))
      .toThrow(/migration_run_id_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: { ...validRuntimeArtifact(), token: "secret" } }), { expectedTargetSha: SHA }))
      .toThrow(/sensitive_key_rejected/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: { ...validMigrationArtifact(), leak: "postgres://user:pw@host/db" } }), { expectedTargetSha: SHA }))
      .toThrow(/sensitive_value_rejected/);
  });

  it("does not fabricate final Founder/Harmony promotion approvals", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect("founderApproval" in composed).toBe(false);
    expect("harmonyGovernanceApproval" in composed).toBe(false);
  });

  it("supports governed waiver without claiming runtime certification passed", () => {
    const input = validInput({
      runtimeArtifact: {},
      runtimeArtifactMeta: {
        artifactId: "99999",
        runId: "777777",
        runAttempt: 1,
        artifactName: `launch-validation-waiver-${SHA}-777777`,
        waiver: true,
        waiverReason: "preview_certification_contract_incompatibility",
        previewRuntimeCertificationCompleted: false,
      },
    });

    const composed = composeStagingPromotionEvidence(input, { expectedTargetSha: SHA });
    expect(composed.sourceEnvironment).toBe("staging");
    expect(composed.targetEnvironment).toBe("production");
    expect(composed.runtimeCertification).toMatchObject({
      status: "waived",
      waiver: true,
      waiverReason: "preview_certification_contract_incompatibility",
      previewRuntimeCertificationCompleted: false,
      evidenceId: null,
      artifactId: null,
      verifiedAt: null,
    });
  });

  it("fails waiver when reason or completion flag is invalid", () => {
    expect(() => composeStagingPromotionEvidence(validInput({
      runtimeArtifact: {},
      runtimeArtifactMeta: {
        artifactId: "99999",
        runId: "777777",
        runAttempt: 1,
        artifactName: `launch-validation-waiver-${SHA}-777777`,
        waiver: true,
        waiverReason: "wrong_reason",
        previewRuntimeCertificationCompleted: false,
      },
    }), { expectedTargetSha: SHA })).toThrow(/runtime_waiver_reason_invalid/);

    expect(() => composeStagingPromotionEvidence(validInput({
      runtimeArtifact: {},
      runtimeArtifactMeta: {
        artifactId: "99999",
        runId: "777777",
        runAttempt: 1,
        artifactName: `launch-validation-waiver-${SHA}-777777`,
        waiver: true,
        waiverReason: "preview_certification_contract_incompatibility",
        previewRuntimeCertificationCompleted: true,
      },
    }), { expectedTargetSha: SHA })).toThrow(/runtime_waiver_completion_flag_invalid/);
  });
});
