import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertArtifactSafe, validateCompactEvidence } from "./operational-preview-certification.mjs";
import { assertStagingPlanCertificationArtifact } from "./supabase-staging-plan.mjs";

const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const EXPECTED_RUNTIME_CERT = "operational-runtime-live";
const EXPECTED_MIGRATION_CERT = "supabase-staging-migration-plan";
const SHA40 = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertNoSensitiveKeys(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => assertNoSensitiveKeys(entry, `${path}[${idx}]`));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, next] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("password") ||
      normalized.includes("credential") ||
      normalized.includes("cookie") ||
      normalized.includes("database_url") ||
      normalized === "db_url"
    ) {
      fail(`sensitive_key_rejected:${path ? `${path}.` : ""}${key}`);
    }
    assertNoSensitiveKeys(next, path ? `${path}.${key}` : key);
  }
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  const forbiddenPatterns = [
    /postgres:\/\//,
    /supabase.*service_role/,
    /bearer\s+[a-z0-9\-_.]+/,
    /ghp_[a-z0-9]+/,
    /xox[baprs]-[a-z0-9-]+/,
    /vercel[_-]?token/,
    /cookie=/,
    /aws-0-ca-central-1\.pooler\.supabase\.com/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) fail("sensitive_value_rejected");
  }
}

function parseTimestampOrFail(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return value;
}

function assertSha(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertRun(value, code) {
  if (typeof value !== "string" || !RUN_ID.test(value)) fail(code);
  return value;
}

function assertPositiveInteger(value, code) {
  if (!Number.isInteger(value) || value <= 0) fail(code);
  return value;
}

function assertArtifactMeta(meta, family) {
  if (!isObject(meta)) fail(`${family}_artifact_meta_missing`);
  const artifactId = assertRun(String(meta.artifactId ?? ""), `${family}_artifact_id_invalid`);
  const runId = assertRun(String(meta.runId ?? ""), `${family}_run_id_invalid`);
  const runAttempt = assertPositiveInteger(Number(meta.runAttempt), `${family}_run_attempt_invalid`);
  if (typeof meta.artifactName !== "string" || meta.artifactName.trim() === "") fail(`${family}_artifact_name_invalid`);
  const lowered = meta.artifactName.toLowerCase();
  if (lowered.includes("latest") || lowered.includes("head") || lowered.includes("main")) {
    fail(`${family}_artifact_name_mutable_alias`);
  }
  const isRuntimeWaiver = family === "runtime" && meta.waiver === true;
  if (!isRuntimeWaiver && !lowered.includes(family === "runtime" ? "operational-runtime-live" : "supabase-staging-migration-plan")) {
    fail(`${family}_artifact_family_mismatch`);
  }
  return {
    artifactId,
    runId,
    runAttempt,
    artifactName: meta.artifactName,
    waiver: meta.waiver === true,
    waiverReason: meta.waiverReason ?? null,
    previewRuntimeCertificationCompleted: meta.previewRuntimeCertificationCompleted,
  };
}

function buildRuntimeEvidenceId(runtimeArtifact, runtimeMeta) {
  const deploymentId = runtimeArtifact?.deployment?.vercelDeploymentId;
  const outcomeId = runtimeArtifact?.operationalRuntimeSummary?.outcomeId;
  const conditionId = runtimeArtifact?.operationalRuntimeSummary?.runtimeCondition?.conditionId;
  if (typeof deploymentId !== "string") fail("runtime_identity_missing");
  if (typeof outcomeId !== "string" || !/^[0-9a-f]{64}$/.test(outcomeId)) fail("invalid_runtime_outcome_id");
  if (typeof conditionId !== "string" || !/^[0-9a-f]{64}$/.test(conditionId)) fail("invalid_runtime_condition_id");
  return `runtime:${outcomeId}:${conditionId}:${deploymentId}:${runtimeMeta.runId}:${runtimeMeta.runAttempt}`;
}

function buildMigrationEvidenceId(migrationArtifact, migrationMeta) {
  const parts = [
    migrationArtifact.targetSha,
    migrationArtifact.validatorSha256,
    migrationMeta.runId,
    String(migrationMeta.runAttempt),
  ].join(":");
  const digest = createHash("sha256").update(parts).digest("hex");
  return `migration:${digest}`;
}

export function composeStagingPromotionEvidence(input, options = {}) {
  if (!isObject(input)) fail("input_not_object");
  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (!isObject(input.runtimeArtifact)) fail("runtime_artifact_missing");
  if (!isObject(input.migrationArtifact)) fail("migration_artifact_missing");

  const runtimeMeta = assertArtifactMeta(input.runtimeArtifactMeta, "runtime");
  const migrationMeta = assertArtifactMeta(input.migrationArtifactMeta, "migration");

  const runtimeWaived = runtimeMeta.waiver === true;

  if (runtimeWaived) {
    if (runtimeMeta.waiverReason !== "preview_certification_contract_incompatibility") {
      fail("runtime_waiver_reason_invalid");
    }
    if (runtimeMeta.previewRuntimeCertificationCompleted !== false) {
      fail("runtime_waiver_completion_flag_invalid");
    }
  } else if (runtimeMeta.previewRuntimeCertificationCompleted !== undefined && runtimeMeta.previewRuntimeCertificationCompleted !== true) {
    fail("runtime_certification_completion_flag_invalid");
  }

  if (!runtimeWaived) {
    assertNoSensitiveKeys(input.runtimeArtifact);
    assertNoSensitiveValues(input.runtimeArtifact);
  }
  assertNoSensitiveKeys(input.migrationArtifact);
  assertNoSensitiveValues(input.migrationArtifact);

  const expectedSha = assertSha(options.expectedTargetSha ?? (runtimeWaived ? input.migrationArtifact?.targetSha : input.runtimeArtifact?.headSha), "expected_target_sha_invalid");

  const runtimeArtifact = input.runtimeArtifact;
  if (!runtimeWaived) {
    if (runtimeArtifact.certification !== EXPECTED_RUNTIME_CERT) fail("runtime_certification_type_invalid");
    if (runtimeArtifact.result !== "passed") fail("runtime_result_not_passed");
    if (runtimeArtifact.previewUrlClassification !== "approved_vercel_preview") fail("runtime_preview_classification_invalid");
    if (!Number.isInteger(runtimeArtifact.pr) || runtimeArtifact.pr < 1) fail("runtime_pr_invalid");
    if (runtimeArtifact.authenticatedSession !== true) fail("runtime_unauthenticated");
    if (runtimeArtifact.founderAuthorized !== true) fail("runtime_founder_unauthorized");
    if (runtimeArtifact.originMatched !== true) fail("runtime_origin_mismatch");
    const runtimeSha = assertSha(runtimeArtifact.headSha, "runtime_head_sha_invalid");
    if (runtimeSha !== expectedSha) fail("runtime_target_sha_mismatch");
    const compactEvidence = {
      ok: true,
      deployment: runtimeArtifact.deployment,
      operationalRuntimeSummary: runtimeArtifact.operationalRuntimeSummary,
      operationalRuntimeFoundation: runtimeArtifact.operationalRuntimeFoundation,
    };
    validateCompactEvidence(compactEvidence, expectedSha);
    assertArtifactSafe(runtimeArtifact);
    parseTimestampOrFail(runtimeArtifact.verifiedAt, "runtime_verified_at_invalid");
  }

  const migrationArtifact = input.migrationArtifact;
  if (migrationArtifact.certification !== EXPECTED_MIGRATION_CERT) fail("migration_certification_type_invalid");
  assertStagingPlanCertificationArtifact(migrationArtifact, { expectedTargetSha: expectedSha });

  if (assertRun(String(migrationArtifact.workflowRun.runId), "migration_run_id_invalid") !== migrationMeta.runId) {
    fail("migration_run_id_mismatch");
  }
  if (Number(migrationArtifact.workflowRun.runAttempt) !== migrationMeta.runAttempt) {
    fail("migration_run_attempt_mismatch");
  }

  if (migrationArtifact.repository !== EXPECTED_REPOSITORY) {
    fail("repository_mismatch");
  }

  const migrationSha = assertSha(migrationArtifact.targetSha, "migration_target_sha_invalid");
  if (!runtimeWaived) {
    const runtimeSha = assertSha(runtimeArtifact.headSha, "runtime_head_sha_invalid");
    if (migrationSha !== runtimeSha) fail("artifact_target_sha_disagreement");
  }

  const runtimeEvidenceId = runtimeWaived ? null : buildRuntimeEvidenceId(runtimeArtifact, runtimeMeta);
  const migrationEvidenceId = buildMigrationEvidenceId(migrationArtifact, migrationMeta);

  const composed = {
    repository: EXPECTED_REPOSITORY,
    targetSha: expectedSha,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    runtimeCertification: {
      status: runtimeWaived ? "waived" : "passed",
      targetSha: expectedSha,
      certificationType: EXPECTED_RUNTIME_CERT,
      certificationSourceEnvironment: "staging",
      deploymentEnvironment: "preview",
      evidenceId: runtimeEvidenceId,
      artifactId: runtimeWaived ? null : `github-artifact:${runtimeMeta.artifactId}`,
      verifiedAt: runtimeWaived ? null : runtimeArtifact.verifiedAt,
      waiver: runtimeWaived,
      waiverReason: runtimeWaived ? "preview_certification_contract_incompatibility" : null,
      previewRuntimeCertificationCompleted: !runtimeWaived,
      workflowRun: {
        runId: runtimeMeta.runId,
        runAttempt: runtimeMeta.runAttempt,
        artifactName: runtimeMeta.artifactName,
      },
    },
    migrationPlanCertification: {
      status: "passed",
      targetSha: expectedSha,
      certificationType: EXPECTED_MIGRATION_CERT,
      environment: "staging",
      evidenceId: migrationEvidenceId,
      artifactId: `github-artifact:${migrationMeta.artifactId}`,
      verifiedAt: migrationArtifact.verifiedAt,
      workflowRun: {
        runId: migrationMeta.runId,
        runAttempt: migrationMeta.runAttempt,
        artifactName: migrationMeta.artifactName,
      },
    },
  };

  assertNoSensitiveKeys(composed);
  assertNoSensitiveValues(composed);
  return composed;
}

function main() {
  const command = process.argv[2];
  if (command !== "compose") {
    throw new Error("usage: staging-promotion-evidence.mjs compose <input-json> <target-sha>");
  }
  const inputPath = process.argv[3];
  const targetSha = process.argv[4];
  if (!inputPath || !targetSha) {
    throw new Error("usage: staging-promotion-evidence.mjs compose <input-json> <target-sha>");
  }
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const composed = composeStagingPromotionEvidence(payload, { expectedTargetSha: targetSha });
  process.stdout.write(`${JSON.stringify(composed, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : "compose_failed";
    console.error(code);
    process.exit(1);
  }
}
