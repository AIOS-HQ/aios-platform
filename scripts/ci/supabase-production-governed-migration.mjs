import { pathToFileURL } from "node:url";

export const PRODUCTION_PROJECT_REF = "vgsqgxpwjnwssconsptn";
export const PRODUCTION_USERNAME = `postgres.${PRODUCTION_PROJECT_REF}`;
export const PRODUCTION_HOST = "aws-1-us-west-2.pooler.supabase.com";
export const PRODUCTION_PORT = "5432";
export const PRODUCTION_DATABASE = "postgres";
export const APPROVED_FIRST_MIGRATION_FILE = "20260807250000_production_promotion_approval_evidence.sql";
export const APPROVED_SECOND_MIGRATION_FILE = "20260814010000_production_promotion_preview_waiver.sql";
export const PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID = "promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a";
export const AUTHORIZATION_MODE_PROMOTION_ATTESTATION = "promotion_attestation";
export const AUTHORIZATION_MODE_BOOTSTRAP_STAGING_PLAN = "bootstrap_staging_migration_plan";

const CERTIFICATION_NAME = "supabase-production-governed-migration";
const STAGING_PLAN_CERTIFICATION_NAME = "supabase-staging-migration-plan";
const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const EXPECTED_SUPABASE_URL_HOST = `${PRODUCTION_PROJECT_REF}.supabase.co`;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MIGRATION_FILE = /^([0-9]{14})_[a-z0-9_]+\.sql$/;

export function encodeDatabasePassword(password) {
  if (typeof password !== "string" || password.length === 0) throw new Error("missing_password");
  return encodeURIComponent(password).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function extractProjectRefFromSupabaseUrl(supabaseUrl) {
  if (typeof supabaseUrl !== "string" || supabaseUrl.trim() === "") return null;
  try {
    const parsed = new URL(supabaseUrl);
    const [projectRef, domain, tld] = parsed.hostname.split(".");
    if (!projectRef || domain !== "supabase" || tld !== "co") return null;
    return projectRef;
  } catch {
    return null;
  }
}

export function trustedProductionPreflight(password, supabaseUrl, configuredHost) {
  const configuredProductionDbHost = typeof configuredHost === "string"
    ? configuredHost.trim()
    : "";
  const suppliedProjectRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
  return {
    passwordPresent: typeof password === "string" && password.length > 0,
    supabaseUrlPresent: typeof supabaseUrl === "string" && supabaseUrl.trim().length > 0,
    supabaseUrlProjectRefMatchesExpected: suppliedProjectRef === PRODUCTION_PROJECT_REF,
    productionDbHostPresent: configuredProductionDbHost.length > 0,
    productionDbHostMatchesExpected: configuredProductionDbHost === PRODUCTION_HOST,
    targetProjectRefMatchesExpected: PRODUCTION_PROJECT_REF === "vgsqgxpwjnwssconsptn",
    targetUsernameMatchesExpected: PRODUCTION_USERNAME === "postgres.vgsqgxpwjnwssconsptn",
    targetHostMatchesExpected: PRODUCTION_HOST === "aws-1-us-west-2.pooler.supabase.com",
    targetPortMatchesExpected: PRODUCTION_PORT === "5432",
    targetDatabaseMatchesExpected: PRODUCTION_DATABASE === "postgres",
    uriConstructedInternally: true,
  };
}

function assertConfiguredProductionDbHost(configuredHost) {
  if (typeof configuredHost !== "string" || configuredHost.trim() === "") {
    throw new Error("production_db_host_missing");
  }

  const normalizedHost = configuredHost.trim();
  if (normalizedHost !== PRODUCTION_HOST) {
    throw new Error("production_db_host_mismatch");
  }

  return normalizedHost;
}

function assertTrustedProductionTarget(configuredHost) {
  const trustedProductionDbHost = assertConfiguredProductionDbHost(configuredHost);
  const preflight = trustedProductionPreflight("configured", `https://${EXPECTED_SUPABASE_URL_HOST}`, trustedProductionDbHost);
  if (
    !preflight.targetProjectRefMatchesExpected
    || !preflight.targetUsernameMatchesExpected
    || !preflight.targetHostMatchesExpected
    || !preflight.targetPortMatchesExpected
    || !preflight.targetDatabaseMatchesExpected
    || !preflight.uriConstructedInternally
  ) {
    throw new Error("trusted_production_target_mismatch");
  }

  return trustedProductionDbHost;
}

export function assembleProductionDatabaseUri(password, configuredHost) {
  const trustedProductionDbHost = assertTrustedProductionTarget(configuredHost);
  const encodedPassword = encodeDatabasePassword(password);
  const uri = `postgresql://${PRODUCTION_USERNAME}:${encodedPassword}@${trustedProductionDbHost}:${PRODUCTION_PORT}/${PRODUCTION_DATABASE}`;
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "postgresql:"
    || parsed.username !== PRODUCTION_USERNAME
    || decodeURIComponent(parsed.password) !== password
    || parsed.hostname !== trustedProductionDbHost
    || parsed.port !== PRODUCTION_PORT
    || parsed.pathname !== `/${PRODUCTION_DATABASE}`
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("trusted_production_uri_construction_failed");
  }
  return uri;
}

export function sanitizeCommandOutput(output, secrets = []) {
  let sanitized = String(output);
  const orderedSecrets = Array.from(new Set(secrets.filter((secret) => typeof secret === "string" && secret.length > 0)))
    .sort((left, right) => right.length - left.length);
  for (const secret of orderedSecrets) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DB_URI]");
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertSha40(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function assertRunIdentity(value, code) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) fail(code);
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  if (!Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function assertBoolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function assertAuthorizationMode(value, code) {
  if (value !== AUTHORIZATION_MODE_PROMOTION_ATTESTATION && value !== AUTHORIZATION_MODE_BOOTSTRAP_STAGING_PLAN) {
    fail(code);
  }
  return value;
}

function assertNonEmptyText(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  return value;
}

function assertMigrationFile(value, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.trim();
  const match = MIGRATION_FILE.exec(normalized);
  if (!match) fail(code);
  return { file: normalized, version: match[1] };
}

function assertApprovedMigrationFile(value, expected, code) {
  const parsed = assertMigrationFile(value, code);
  if (parsed.file !== expected) fail(code);
  return parsed;
}

function assertNoSensitiveKeys(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, next] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret")
      || normalized.includes("token")
      || normalized.includes("password")
      || normalized.includes("cookie")
      || normalized.includes("credential")
      || normalized.includes("database_url")
      || normalized === "db_url"
      || normalized.includes("databaseuri")
      || normalized === "databaseuri"
      || normalized === "database_uri"
      || normalized === "host"
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
    /postgresql:\/\//,
    /service_role/,
    /bearer\s+[a-z0-9\-_.]+/,
    /ghp_[a-z0-9]+/,
    /cookie=/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) fail("sensitive_value_rejected");
  }
}

function parseAppliedMigrationVersions(value) {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (!/^[0-9]{14}$/.test(entry)) fail("applied_migration_versions_invalid");
      return entry;
    });
}

export function buildProductionMigrationEvidenceArtifact(input) {
  if (!isObject(input)) fail("artifact_input_missing");

  const targetSha = assertSha40(input.targetSha, "target_sha_invalid");
  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (input.environment !== "production") fail("environment_mismatch");
  if (input.result !== "passed") fail("result_mismatch");
  if (input.mode !== "apply") fail("mode_mismatch");

  const firstMigration = assertApprovedMigrationFile(
    input.firstMigrationFile,
    APPROVED_FIRST_MIGRATION_FILE,
    "first_migration_invalid",
  );
  const secondMigration = assertApprovedMigrationFile(
    input.secondMigrationFile,
    APPROVED_SECOND_MIGRATION_FILE,
    "second_migration_invalid",
  );
  if (firstMigration.version >= secondMigration.version) fail("migration_order_invalid");

  const dryRunValidated = assertBoolean(input.dryRunValidated, "dry_run_validated_invalid");
  const applyExecuted = assertBoolean(input.applyExecuted, "apply_executed_invalid");
  const unrelatedPendingMigrations = assertBoolean(
    input.unrelatedPendingMigrations,
    "unrelated_pending_migrations_invalid",
  );
  const projectIdentityVerified = assertBoolean(input.projectIdentityVerified, "project_identity_verified_invalid");

  if (!dryRunValidated) fail("dry_run_required");
  if (!applyExecuted) fail("apply_required");
  if (unrelatedPendingMigrations) fail("unrelated_pending_migrations_detected");
  if (!projectIdentityVerified) fail("project_identity_not_verified");
  if (input.projectRef !== PRODUCTION_PROJECT_REF) fail("project_ref_mismatch");

  const authorizationMode = assertAuthorizationMode(
    input.authorizationMode,
    "authorization_mode_invalid",
  );

  let authorization;
  if (authorizationMode === AUTHORIZATION_MODE_PROMOTION_ATTESTATION) {
    const promotionArtifactId = assertRunIdentity(String(input.promotionArtifactId), "promotion_artifact_id_invalid");
    const promotionWorkflowRunId = assertRunIdentity(String(input.promotionWorkflowRunId), "promotion_workflow_run_id_invalid");
    const promotionWorkflowRunAttempt = Number(
      assertRunIdentity(String(input.promotionWorkflowRunAttempt), "promotion_workflow_run_attempt_invalid"),
    );
    const promotionArtifactName = assertNonEmptyText(input.promotionArtifactName, "promotion_artifact_name_invalid");
    const promotionWorkflowRef = assertNonEmptyText(input.promotionWorkflowRef, "promotion_workflow_ref_invalid");

    authorization = {
      mode: AUTHORIZATION_MODE_PROMOTION_ATTESTATION,
      promotionAttestation: {
        artifactId: promotionArtifactId,
        artifactName: promotionArtifactName,
        workflowRunId: promotionWorkflowRunId,
        workflowRunAttempt: promotionWorkflowRunAttempt,
        workflowRef: promotionWorkflowRef,
      },
    };
  } else {
    const stagingMigrationArtifactId = assertRunIdentity(
      String(input.stagingMigrationArtifactId),
      "staging_migration_artifact_id_invalid",
    );
    const stagingMigrationWorkflowRunId = assertRunIdentity(
      String(input.stagingMigrationWorkflowRunId),
      "staging_migration_workflow_run_id_invalid",
    );
    const stagingMigrationWorkflowRunAttempt = Number(
      assertRunIdentity(
        String(input.stagingMigrationWorkflowRunAttempt),
        "staging_migration_workflow_run_attempt_invalid",
      ),
    );
    const stagingMigrationArtifactName = assertNonEmptyText(
      input.stagingMigrationArtifactName,
      "staging_migration_artifact_name_invalid",
    );
    const stagingMigrationWorkflowRef = assertNonEmptyText(
      input.stagingMigrationWorkflowRef,
      "staging_migration_workflow_ref_invalid",
    );
    const stagingMigrationCertificationName = assertNonEmptyText(
      input.stagingMigrationCertificationName,
      "staging_migration_certification_name_invalid",
    );
    if (stagingMigrationCertificationName !== STAGING_PLAN_CERTIFICATION_NAME) {
      fail("staging_migration_certification_name_invalid");
    }
    const stagingMigrationCertificationTargetSha = assertSha40(
      input.stagingMigrationCertificationTargetSha,
      "staging_migration_target_sha_invalid",
    );
    if (stagingMigrationCertificationTargetSha !== targetSha) {
      fail("staging_migration_target_sha_mismatch");
    }

    authorization = {
      mode: AUTHORIZATION_MODE_BOOTSTRAP_STAGING_PLAN,
      bootstrapStagingMigrationPlan: {
        artifactId: stagingMigrationArtifactId,
        artifactName: stagingMigrationArtifactName,
        workflowRunId: stagingMigrationWorkflowRunId,
        workflowRunAttempt: stagingMigrationWorkflowRunAttempt,
        workflowRef: stagingMigrationWorkflowRef,
        certificationName: stagingMigrationCertificationName,
        certificationTargetSha: stagingMigrationCertificationTargetSha,
      },
    };
  }

  const trustedControlSha = assertSha40(input.trustedControlSha, "trusted_control_sha_invalid");
  const validatorSha256 = assertSha256(input.validatorSha256, "validator_sha256_invalid");
  const runId = assertRunIdentity(String(input.runId), "run_id_invalid");
  const runAttempt = Number(assertRunIdentity(String(input.runAttempt), "run_attempt_invalid"));
  if (typeof input.workflowRef !== "string" || input.workflowRef.trim() === "") fail("workflow_ref_invalid");
  const verifiedAt = assertTimestamp(input.verifiedAt, "verified_at_invalid");

  const appliedMigrationVersions = parseAppliedMigrationVersions(input.appliedMigrationVersions);

  const artifact = {
    certification: CERTIFICATION_NAME,
    repository: EXPECTED_REPOSITORY,
    environment: "production",
    result: "passed",
    mode: "apply",
    targetSha,
    approvedMigrationRange: {
      firstMigrationFile: firstMigration.file,
      firstMigrationVersion: firstMigration.version,
      secondMigrationFile: secondMigration.file,
      secondMigrationVersion: secondMigration.version,
    },
    dryRunValidated: true,
    applyExecuted: true,
    unrelatedPendingMigrations: false,
    projectIdentity: {
      projectRef: PRODUCTION_PROJECT_REF,
      verified: true,
    },
    authorization,
    appliedMigrationVersions,
    trustedControlSha,
    validatorSha256,
    workflowRun: {
      runId,
      runAttempt,
      workflowRef: input.workflowRef,
    },
    verifiedAt,
  };

  assertProductionMigrationEvidenceArtifact(artifact, {
    expectedTargetSha: targetSha,
    expectedFirstMigrationFile: firstMigration.file,
    expectedSecondMigrationFile: secondMigration.file,
  });
  return artifact;
}

export function assertProductionMigrationEvidenceArtifact(artifact, options = {}) {
  if (!isObject(artifact)) fail("artifact_not_object");
  assertNoSensitiveKeys(artifact);
  assertNoSensitiveValues(artifact);

  if (artifact.certification !== CERTIFICATION_NAME) fail("certification_name_invalid");
  if (artifact.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (artifact.environment !== "production") fail("environment_mismatch");
  if (artifact.result !== "passed") fail("result_mismatch");
  if (artifact.mode !== "apply") fail("mode_mismatch");

  const targetSha = assertSha40(artifact.targetSha, "target_sha_invalid");
  if (options.expectedTargetSha && targetSha !== options.expectedTargetSha) fail("target_sha_mismatch");

  if (!isObject(artifact.approvedMigrationRange)) fail("approved_migration_range_missing");
  const firstMigration = assertApprovedMigrationFile(
    artifact.approvedMigrationRange.firstMigrationFile,
    APPROVED_FIRST_MIGRATION_FILE,
    "first_migration_invalid",
  );
  const secondMigration = assertApprovedMigrationFile(
    artifact.approvedMigrationRange.secondMigrationFile,
    APPROVED_SECOND_MIGRATION_FILE,
    "second_migration_invalid",
  );
  if (artifact.approvedMigrationRange.firstMigrationVersion !== firstMigration.version) fail("first_migration_version_invalid");
  if (artifact.approvedMigrationRange.secondMigrationVersion !== secondMigration.version) fail("second_migration_version_invalid");
  if (firstMigration.version >= secondMigration.version) fail("migration_order_invalid");
  if (options.expectedFirstMigrationFile && firstMigration.file !== options.expectedFirstMigrationFile) fail("first_migration_mismatch");
  if (options.expectedSecondMigrationFile && secondMigration.file !== options.expectedSecondMigrationFile) fail("second_migration_mismatch");

  if (artifact.dryRunValidated !== true) fail("dry_run_required");
  if (artifact.applyExecuted !== true) fail("apply_required");
  if (artifact.unrelatedPendingMigrations !== false) fail("unrelated_pending_migrations_detected");

  if (!isObject(artifact.projectIdentity)) fail("project_identity_missing");
  if (artifact.projectIdentity.projectRef !== PRODUCTION_PROJECT_REF) fail("project_ref_mismatch");
  if (artifact.projectIdentity.verified !== true) fail("project_identity_not_verified");

  if (!isObject(artifact.authorization)) fail("authorization_missing");
  const authorizationMode = assertAuthorizationMode(
    artifact.authorization.mode,
    "authorization_mode_invalid",
  );
  if (options.expectedAuthorizationMode && authorizationMode !== options.expectedAuthorizationMode) {
    fail("authorization_mode_mismatch");
  }

  if (authorizationMode === AUTHORIZATION_MODE_PROMOTION_ATTESTATION) {
    if (!isObject(artifact.authorization.promotionAttestation)) fail("promotion_authorization_missing");
    assertRunIdentity(String(artifact.authorization.promotionAttestation.artifactId), "promotion_artifact_id_invalid");
    assertRunIdentity(String(artifact.authorization.promotionAttestation.workflowRunId), "promotion_workflow_run_id_invalid");
    assertRunIdentity(String(artifact.authorization.promotionAttestation.workflowRunAttempt), "promotion_workflow_run_attempt_invalid");
    if (
      typeof artifact.authorization.promotionAttestation.artifactName !== "string"
      || !artifact.authorization.promotionAttestation.artifactName.startsWith("promotion-attestation-")
    ) {
      fail("promotion_artifact_name_invalid");
    }
    if (
      typeof artifact.authorization.promotionAttestation.workflowRef !== "string"
      || artifact.authorization.promotionAttestation.workflowRef.trim() === ""
    ) {
      fail("promotion_workflow_ref_invalid");
    }
  } else {
    if (!isObject(artifact.authorization.bootstrapStagingMigrationPlan)) fail("staging_migration_authorization_missing");
    assertRunIdentity(String(artifact.authorization.bootstrapStagingMigrationPlan.artifactId), "staging_migration_artifact_id_invalid");
    assertRunIdentity(String(artifact.authorization.bootstrapStagingMigrationPlan.workflowRunId), "staging_migration_workflow_run_id_invalid");
    assertRunIdentity(String(artifact.authorization.bootstrapStagingMigrationPlan.workflowRunAttempt), "staging_migration_workflow_run_attempt_invalid");
    if (
      typeof artifact.authorization.bootstrapStagingMigrationPlan.artifactName !== "string"
      || !artifact.authorization.bootstrapStagingMigrationPlan.artifactName.startsWith("supabase-staging-migration-plan-")
    ) {
      fail("staging_migration_artifact_name_invalid");
    }
    if (
      typeof artifact.authorization.bootstrapStagingMigrationPlan.workflowRef !== "string"
      || artifact.authorization.bootstrapStagingMigrationPlan.workflowRef.trim() === ""
    ) {
      fail("staging_migration_workflow_ref_invalid");
    }
    if (artifact.authorization.bootstrapStagingMigrationPlan.certificationName !== STAGING_PLAN_CERTIFICATION_NAME) {
      fail("staging_migration_certification_name_invalid");
    }
    const stagingTargetSha = assertSha40(
      artifact.authorization.bootstrapStagingMigrationPlan.certificationTargetSha,
      "staging_migration_target_sha_invalid",
    );
    if (stagingTargetSha !== targetSha) fail("staging_migration_target_sha_mismatch");
  }

  if (!Array.isArray(artifact.appliedMigrationVersions)) fail("applied_migration_versions_invalid");
  for (const version of artifact.appliedMigrationVersions) {
    if (typeof version !== "string" || !/^[0-9]{14}$/.test(version)) fail("applied_migration_versions_invalid");
  }

  assertSha40(artifact.trustedControlSha, "trusted_control_sha_invalid");
  assertSha256(artifact.validatorSha256, "validator_sha256_invalid");
  if (!isObject(artifact.workflowRun)) fail("workflow_run_missing");
  assertRunIdentity(String(artifact.workflowRun.runId), "run_id_invalid");
  assertRunIdentity(String(artifact.workflowRun.runAttempt), "run_attempt_invalid");
  if (typeof artifact.workflowRun.workflowRef !== "string" || artifact.workflowRun.workflowRef.trim() === "") fail("workflow_ref_invalid");
  assertTimestamp(artifact.verifiedAt, "verified_at_invalid");
  return true;
}

async function readStandardInput() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const command = process.argv[2];

  if (command === "preflight") {
    const preflight = trustedProductionPreflight(
      process.env.SUPABASE_PRODUCTION_DB_PASSWORD,
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PRODUCTION_DB_HOST,
    );
    for (const [key, value] of Object.entries(preflight)) console.info(`${key}=${value}`);
    if (!preflight.passwordPresent) throw new Error("missing_password");
    if (!preflight.supabaseUrlPresent) throw new Error("supabase_url_missing");
    if (!preflight.supabaseUrlProjectRefMatchesExpected) throw new Error("supabase_project_ref_mismatch");
    if (!preflight.productionDbHostPresent) throw new Error("production_db_host_missing");
    if (!preflight.productionDbHostMatchesExpected) throw new Error("production_db_host_mismatch");
    assertTrustedProductionTarget(process.env.SUPABASE_PRODUCTION_DB_HOST ?? "");
    return;
  }

  if (command === "assemble") {
    process.stdout.write(assembleProductionDatabaseUri(
      process.env.SUPABASE_PRODUCTION_DB_PASSWORD ?? "",
      process.env.SUPABASE_PRODUCTION_DB_HOST ?? "",
    ));
    return;
  }

  if (command === "encode-password") {
    process.stdout.write(encodeDatabasePassword(process.env.SUPABASE_PRODUCTION_DB_PASSWORD ?? ""));
    return;
  }

  if (command === "sanitize") {
    const output = await readStandardInput();
    process.stdout.write(sanitizeCommandOutput(output, [
      process.env.SUPABASE_PRODUCTION_DB_PASSWORD,
      process.env.SUPABASE_PRODUCTION_DB_PASSWORD_ENCODED,
      process.env.SUPABASE_PRODUCTION_DB_URI,
    ]));
    return;
  }

  if (command === "write-artifact") {
    const artifactPath = process.env.PRODUCTION_MIGRATION_ARTIFACT_PATH ?? "";
    if (artifactPath.trim() === "") throw new Error("artifact_path_missing");

    const artifact = buildProductionMigrationEvidenceArtifact({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      environment: process.env.PRODUCTION_MIGRATION_ENVIRONMENT ?? "",
      result: process.env.PRODUCTION_MIGRATION_RESULT ?? "",
      mode: process.env.PRODUCTION_MIGRATION_MODE ?? "",
      authorizationMode: process.env.PRODUCTION_MIGRATION_AUTHORIZATION_MODE ?? "",
      targetSha: process.env.TARGET_SHA ?? "",
      firstMigrationFile: process.env.FIRST_MIGRATION_FILE ?? "",
      secondMigrationFile: process.env.SECOND_MIGRATION_FILE ?? "",
      dryRunValidated: process.env.PRODUCTION_MIGRATION_DRY_RUN_VALIDATED === "true",
      applyExecuted: process.env.PRODUCTION_MIGRATION_APPLY_EXECUTED === "true",
      unrelatedPendingMigrations: process.env.PRODUCTION_MIGRATION_UNRELATED_PENDING === "true",
      projectRef: process.env.PRODUCTION_MIGRATION_PROJECT_REF ?? "",
      projectIdentityVerified: process.env.PRODUCTION_MIGRATION_PROJECT_IDENTITY_VERIFIED === "true",
      promotionArtifactId: process.env.PROMOTION_ARTIFACT_ID ?? "",
      promotionArtifactName: process.env.PROMOTION_ARTIFACT_NAME ?? "",
      promotionWorkflowRunId: process.env.PROMOTION_WORKFLOW_RUN_ID ?? "",
      promotionWorkflowRunAttempt: process.env.PROMOTION_WORKFLOW_RUN_ATTEMPT ?? "",
      promotionWorkflowRef: process.env.PROMOTION_WORKFLOW_REF ?? "",
      stagingMigrationArtifactId: process.env.STAGING_MIGRATION_ARTIFACT_ID ?? "",
      stagingMigrationArtifactName: process.env.STAGING_MIGRATION_ARTIFACT_NAME ?? "",
      stagingMigrationWorkflowRunId: process.env.STAGING_MIGRATION_WORKFLOW_RUN_ID ?? "",
      stagingMigrationWorkflowRunAttempt: process.env.STAGING_MIGRATION_WORKFLOW_RUN_ATTEMPT ?? "",
      stagingMigrationWorkflowRef: process.env.STAGING_MIGRATION_WORKFLOW_REF ?? "",
      stagingMigrationCertificationName: process.env.STAGING_MIGRATION_CERTIFICATION_NAME ?? "",
      stagingMigrationCertificationTargetSha: process.env.STAGING_MIGRATION_CERTIFICATION_TARGET_SHA ?? "",
      appliedMigrationVersions: process.env.MIGRATION_APPLIED_VERSIONS ?? "",
      trustedControlSha: process.env.TRUSTED_CONTROL_SHA ?? "",
      validatorSha256: process.env.TRUSTED_VALIDATOR_SHA256 ?? "",
      runId: process.env.GITHUB_RUN_ID ?? "",
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
      workflowRef: process.env.GITHUB_WORKFLOW_REF ?? "",
      verifiedAt: new Date().toISOString(),
    });

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    process.stdout.write(`${artifactPath}\n`);
    return;
  }

  if (command === "validate-artifact") {
    const artifactPath = process.env.PRODUCTION_MIGRATION_ARTIFACT_PATH ?? "";
    if (artifactPath.trim() === "") throw new Error("artifact_path_missing");

    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(artifactPath, "utf8");
    const parsed = JSON.parse(raw);
    assertProductionMigrationEvidenceArtifact(parsed, {
      expectedTargetSha: process.env.TARGET_SHA ?? "",
      expectedFirstMigrationFile: process.env.FIRST_MIGRATION_FILE ?? "",
      expectedSecondMigrationFile: process.env.SECOND_MIGRATION_FILE ?? "",
      expectedAuthorizationMode: process.env.PRODUCTION_MIGRATION_AUTHORIZATION_MODE ?? "",
    });
    return;
  }

  throw new Error("unsupported_command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeReason = error instanceof Error && /^[a-z_]+(?::[a-z0-9_./-]+)?$/.test(error.message)
      ? error.message
      : "validation_failed";
    console.error(safeReason);
    process.exitCode = 1;
  });
}
