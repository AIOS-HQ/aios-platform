import { describe, expect, it } from "vitest";
import { composeStagingPromotionEvidence } from "../../scripts/ci/staging-promotion-evidence.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validRuntimeArtifact(overrides = {}) {
  return {
    certification: "operational-runtime-live",
    repository: "AIOS-HQ/aios-platform",
    headSha: SHA,
    authenticatedSession: true,
    founderAuthorized: true,
    originMatched: true,
    deployment: {
      commitSha: SHA,
      environment: "preview",
      vercelDeploymentId: "dpl_1234567890",
    },
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
    runtimeArtifact: validRuntimeArtifact(),
    migrationArtifact: validMigrationArtifact(),
    runtimeArtifactMeta: {
      artifactId: "22222",
      runId: "33333",
      runAttempt: 1,
      artifactName: `operational-runtime-live-${SHA}-33333`,
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
  it("composes valid runtime + migration evidence with shared target SHA", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect(composed.repository).toBe("AIOS-HQ/aios-platform");
    expect(composed.targetSha).toBe(SHA);
    expect(composed.sourceEnvironment).toBe("staging");
    expect(composed.runtimeCertification.status).toBe("passed");
    expect(composed.migrationPlanCertification.status).toBe("passed");
    expect(composed.runtimeCertification.targetSha).toBe(SHA);
    expect(composed.migrationPlanCertification.targetSha).toBe(SHA);
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

  it("normalizes evidence so it can satisfy M5A attestation field requirements", () => {
    const composed = composeStagingPromotionEvidence(validInput(), { expectedTargetSha: SHA });
    expect(composed.runtimeCertification).toMatchObject({
      status: "passed",
      targetSha: SHA,
      evidenceId: expect.any(String),
      artifactId: expect.stringMatching(/^github-artifact:[1-9][0-9]*$/),
      verifiedAt: expect.any(String),
    });
    expect(composed.migrationPlanCertification).toMatchObject({
      status: "passed",
      targetSha: SHA,
      evidenceId: expect.any(String),
      artifactId: expect.stringMatching(/^github-artifact:[1-9][0-9]*$/),
      verifiedAt: expect.any(String),
    });
  });

  it("fails closed for runtime target mismatch, failed result, bad preview/security flags, and malformed timestamp", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ headSha: "a".repeat(40) }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_target_sha_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ result: "failed" }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_result_not_passed/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ deployment: { commitSha: SHA, environment: "production", vercelDeploymentId: "dpl_123" } }) }), { expectedTargetSha: SHA }))
      .toThrow(/wrong_deployment_environment/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ authenticatedSession: false }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_unauthenticated/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ founderAuthorized: false }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_founder_unauthorized/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: validRuntimeArtifact({ verifiedAt: "not-a-date" }) }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_verified_at_invalid/);
  });

  it("fails closed for migration mismatch/malformed/db change flag and run identity mismatch", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ targetSha: "b".repeat(40) }) }), { expectedTargetSha: SHA }))
      .toThrow(/target_sha_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ result: "failed" }) }), { expectedTargetSha: SHA }))
      .toThrow(/result_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ databaseChangesApplied: true }) }), { expectedTargetSha: SHA }))
      .toThrow(/database_changes_flag_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifactMeta: { artifactId: "44444", runId: "999", runAttempt: 1, artifactName: `supabase-staging-migration-plan-${SHA}-999` } }), { expectedTargetSha: SHA }))
      .toThrow(/migration_run_id_mismatch/);
  });

  it("fails closed for invalid artifact IDs/run identities/aliases and mutable names", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifactMeta: { artifactId: "0", runId: "33333", runAttempt: 1, artifactName: `operational-runtime-live-${SHA}-33333` } }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_artifact_id_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifactMeta: { artifactId: "22222", runId: "0", runAttempt: 1, artifactName: `operational-runtime-live-${SHA}-33333` } }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_run_id_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifactMeta: { artifactId: "22222", runId: "33333", runAttempt: 0, artifactName: `operational-runtime-live-${SHA}-33333` } }), { expectedTargetSha: SHA }))
      .toThrow(/runtime_run_attempt_invalid/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifactMeta: { artifactId: "44444", runId: "123456", runAttempt: 1, artifactName: "supabase-staging-migration-plan-latest" } }), { expectedTargetSha: SHA }))
      .toThrow(/migration_artifact_name_mutable_alias/);
  });

  it("fails closed for SHA disagreement, repository mismatch, and sensitive payloads", () => {
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ targetSha: "f".repeat(40) }), runtimeArtifact: validRuntimeArtifact() }), { expectedTargetSha: "f".repeat(40) }))
      .toThrow(/runtime_target_sha_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: validMigrationArtifact({ repository: "evil/repo" }) }), { expectedTargetSha: SHA }))
      .toThrow(/repository_mismatch/);
    expect(() => composeStagingPromotionEvidence(validInput({ runtimeArtifact: { ...validRuntimeArtifact(), token: "secret" } }), { expectedTargetSha: SHA }))
      .toThrow(/sensitive_key_rejected/);
    expect(() => composeStagingPromotionEvidence(validInput({ migrationArtifact: { ...validMigrationArtifact(), leak: "postgres://user:pw@host/db" } }), { expectedTargetSha: SHA }))
      .toThrow(/sensitive_value_rejected/);
  });
});
