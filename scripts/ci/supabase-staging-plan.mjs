import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
export const STAGING_USERNAME = `postgres.${STAGING_PROJECT_REF}`;
export const STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
export const STAGING_PORT = "5432";
export const STAGING_DATABASE = "postgres";
export const MAX_PLAN_ATTEMPTS = 3;
const CERTIFICATION_NAME = "supabase-staging-migration-plan";
const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const EXPECTED_STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
const EXPECTED_STAGING_USERNAME = "postgres.rorbiijpgahvwdrejpil";
const EXPECTED_STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
const EXPECTED_STAGING_PORT = "5432";
const EXPECTED_STAGING_DATABASE = "postgres";

const PRE_NETWORK_NON_RETRYABLE_FAILURES = [
  {
    safeCode: "authentication_failed",
    pattern: /password authentication failed|authentication failed|failed sasl auth|invalid password|invalid username|sqlstate\s*28p01/i,
  },
  {
    safeCode: "tls_validation_failed",
    pattern: /certificate verify failed|certificate validation|tls handshake|x509/i,
  },
  {
    safeCode: "project_identity_mismatch",
    pattern: /project mismatch|invalid project|project not found|tenant or user not found/i,
  },
];

const RETRYABLE_FAILURES = [
  {
    safeCode: "transient_dns_failure",
    pattern: /enotfound|eai_again|temporary failure in name resolution|could not translate host name|no such host/i,
  },
  {
    safeCode: "transient_connection_timeout",
    pattern: /etimedout|connection timed out|timeout expired|i\/o timeout|deadline exceeded/i,
  },
];

const NON_RETRYABLE_PLAN_FAILURES = [
  {
    safeCode: "migration_plan_failed",
    pattern: /sqlstate\s*(?:22|23|2b|2d|40|42|44|p0|xx)[0-9a-z]{3}|syntax error|duplicate key|migration (?:plan )?failed/i,
  },
];

export function encodeDatabasePassword(password) {
  if (typeof password !== "string" || password.length === 0) throw new Error("missing_password");
  return encodeURIComponent(password).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function trustedStagingPreflight(password) {
  return {
    passwordPresent: typeof password === "string" && password.length > 0,
    targetProjectRefMatchesExpected: STAGING_PROJECT_REF === EXPECTED_STAGING_PROJECT_REF,
    targetUsernameMatchesExpected: STAGING_USERNAME === EXPECTED_STAGING_USERNAME,
    targetHostMatchesExpected: STAGING_HOST === EXPECTED_STAGING_HOST,
    targetPortMatchesExpected: STAGING_PORT === EXPECTED_STAGING_PORT,
    targetDatabaseMatchesExpected: STAGING_DATABASE === EXPECTED_STAGING_DATABASE,
    uriConstructedInternally: true,
  };
}

function assertTrustedStagingTarget() {
  const preflight = trustedStagingPreflight("configured");
  if (
    !preflight.targetProjectRefMatchesExpected
    || !preflight.targetUsernameMatchesExpected
    || !preflight.targetHostMatchesExpected
    || !preflight.targetPortMatchesExpected
    || !preflight.targetDatabaseMatchesExpected
    || !preflight.uriConstructedInternally
  ) {
    throw new Error("trusted_staging_target_mismatch");
  }
}

export function assembleStagingDatabaseUri(password) {
  assertTrustedStagingTarget();
  const encodedPassword = encodeDatabasePassword(password);
  const uri = `postgresql://${STAGING_USERNAME}:${encodedPassword}@${STAGING_HOST}:${STAGING_PORT}/${STAGING_DATABASE}`;
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "postgresql:"
    || parsed.username !== STAGING_USERNAME
    || decodeURIComponent(parsed.password) !== password
    || parsed.hostname !== STAGING_HOST
    || parsed.port !== STAGING_PORT
    || parsed.pathname !== `/${STAGING_DATABASE}`
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("trusted_staging_uri_construction_failed");
  }
  return uri;
}

export function sanitizePlanOutput(output, secrets = []) {
  let sanitized = String(output);
  const orderedSecrets = Array.from(new Set(secrets.filter((secret) => typeof secret === "string" && secret.length > 0)))
    .sort((left, right) => right.length - left.length);
  for (const secret of orderedSecrets) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DB_URI]");
}

export function classifyPlanAttemptFailure(output) {
  const normalized = String(output);
  const preNetworkFailure = PRE_NETWORK_NON_RETRYABLE_FAILURES.find(({ pattern }) => pattern.test(normalized));
  if (preNetworkFailure) return { retryable: false, safeCode: preNetworkFailure.safeCode };
  const retryable = RETRYABLE_FAILURES.find(({ pattern }) => pattern.test(normalized));
  if (retryable) return { retryable: true, safeCode: retryable.safeCode };
  const planFailure = NON_RETRYABLE_PLAN_FAILURES.find(({ pattern }) => pattern.test(normalized));
  if (planFailure) return { retryable: false, safeCode: planFailure.safeCode };
  return { retryable: false, safeCode: "non_transient_plan_failure" };
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
      || normalized === "staginghost"
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
    /aws-0-ca-central-1\.pooler\.supabase\.com/,
    /supabase.*service_role/,
    /bearer\s+[a-z0-9\-_.]+/,
    /ghp_[a-z0-9]+/,
    /cookie=/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) fail("sensitive_value_rejected");
  }
}

export function buildStagingPlanCertificationArtifact(input) {
  if (!isObject(input)) fail("artifact_input_missing");
  const targetSha = assertSha40(input.targetSha, "target_sha_invalid");
  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (input.environment !== "staging") fail("environment_mismatch");
  if (input.result !== "passed") fail("result_mismatch");
  if (input.mode !== "dry_run") fail("mode_mismatch");
  if (input.databaseChangesApplied !== false) fail("database_changes_flag_invalid");
  if (input.completeHistory !== true) fail("complete_history_flag_invalid");
  if (!Number.isInteger(input.migrationCount) || input.migrationCount <= 0) fail("migration_count_invalid");

  const trustedControlSha = assertSha40(input.trustedControlSha, "trusted_control_sha_invalid");
  const validatorSha256 = assertSha256(input.validatorSha256, "validator_sha256_invalid");
  const runId = assertRunIdentity(input.runId, "run_id_invalid");
  const runAttempt = Number(assertRunIdentity(String(input.runAttempt), "run_attempt_invalid"));
  if (typeof input.workflowRef !== "string" || input.workflowRef.trim() === "") fail("workflow_ref_invalid");
  const verifiedAt = assertTimestamp(input.verifiedAt, "verified_at_invalid");

  const artifact = {
    certification: CERTIFICATION_NAME,
    repository: EXPECTED_REPOSITORY,
    targetSha,
    environment: "staging",
    result: "passed",
    mode: "dry_run",
    databaseChangesApplied: false,
    completeHistory: true,
    migrationCount: input.migrationCount,
    trustedControlSha,
    validatorSha256,
    workflowRun: {
      runId,
      runAttempt,
      workflowRef: input.workflowRef,
    },
    verifiedAt,
  };

  assertStagingPlanCertificationArtifact(artifact, { expectedTargetSha: targetSha });
  return artifact;
}

export function assertStagingPlanCertificationArtifact(artifact, options = {}) {
  if (!isObject(artifact)) fail("artifact_not_object");
  assertNoSensitiveKeys(artifact);
  assertNoSensitiveValues(artifact);

  if (artifact.certification !== CERTIFICATION_NAME) fail("certification_name_invalid");
  if (artifact.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (artifact.environment !== "staging") fail("environment_mismatch");
  if (artifact.result !== "passed") fail("result_mismatch");
  if (artifact.mode !== "dry_run") fail("mode_mismatch");
  if (artifact.databaseChangesApplied !== false) fail("database_changes_flag_invalid");
  if (artifact.completeHistory !== true) fail("complete_history_flag_invalid");
  if (!Number.isInteger(artifact.migrationCount) || artifact.migrationCount <= 0) fail("migration_count_invalid");

  const targetSha = assertSha40(artifact.targetSha, "target_sha_invalid");
  if (options.expectedTargetSha && targetSha !== options.expectedTargetSha) fail("target_sha_mismatch");
  assertSha40(artifact.trustedControlSha, "trusted_control_sha_invalid");
  assertSha256(artifact.validatorSha256, "validator_sha256_invalid");
  if (!isObject(artifact.workflowRun)) fail("workflow_run_missing");
  assertRunIdentity(artifact.workflowRun.runId, "run_id_invalid");
  assertRunIdentity(String(artifact.workflowRun.runAttempt), "run_attempt_invalid");
  if (typeof artifact.workflowRun.workflowRef !== "string" || artifact.workflowRun.workflowRef.trim() === "") fail("workflow_ref_invalid");
  assertTimestamp(artifact.verifiedAt, "verified_at_invalid");
  return true;
}

export async function runPlanWithTransientRetry(runAttempt, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_PLAN_ATTEMPTS;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_PLAN_ATTEMPTS) {
    throw new Error("invalid_attempt_limit");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runAttempt(attempt);
    if (!result || !Number.isInteger(result.status) || typeof result.output !== "string") {
      throw new Error("invalid_attempt_result");
    }
    if (result.status === 0) {
      return { ...result, attemptCount: attempt, classification: null };
    }

    const classification = classifyPlanAttemptFailure(result.output);
    if (!classification.retryable || attempt === maxAttempts) {
      return { ...result, attemptCount: attempt, classification };
    }
    await sleep(2 ** attempt * 1_000);
  }

  throw new Error("unreachable_retry_state");
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
    const preflight = trustedStagingPreflight(process.env.SUPABASE_STAGING_DB_PASSWORD);
    for (const [key, value] of Object.entries(preflight)) console.info(`${key}=${value}`);
    if (!preflight.passwordPresent) throw new Error("missing_password");
    assertTrustedStagingTarget();
    return;
  }
  if (command === "assemble") {
    process.stdout.write(assembleStagingDatabaseUri(process.env.SUPABASE_STAGING_DB_PASSWORD ?? ""));
    return;
  }
  if (command === "encode-password") {
    process.stdout.write(encodeDatabasePassword(process.env.SUPABASE_STAGING_DB_PASSWORD ?? ""));
    return;
  }
  if (command === "sanitize") {
    const output = await readStandardInput();
    process.stdout.write(sanitizePlanOutput(output, [
      process.env.SUPABASE_STAGING_DB_PASSWORD,
      process.env.SUPABASE_STAGING_DB_PASSWORD_ENCODED,
      process.env.SUPABASE_STAGING_DB_URI,
    ]));
    return;
  }
  if (command === "classify-attempt") {
    const output = await readStandardInput();
    const classification = classifyPlanAttemptFailure(output);
    process.stdout.write(classification.safeCode);
    process.exitCode = classification.retryable ? 75 : 1;
    return;
  }
  if (command === "write-artifact") {
    const artifactPath = process.env.STAGING_PLAN_ARTIFACT_PATH ?? "";
    if (artifactPath.trim() === "") throw new Error("artifact_path_missing");

    const migrationCount = Number.parseInt(process.env.MIGRATION_COUNT ?? "", 10);
    const artifact = buildStagingPlanCertificationArtifact({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      targetSha: process.env.TARGET_REF ?? "",
      environment: process.env.STAGING_PLAN_ENVIRONMENT ?? "",
      result: process.env.STAGING_PLAN_RESULT ?? "",
      mode: process.env.STAGING_PLAN_MODE ?? "",
      databaseChangesApplied: (process.env.STAGING_PLAN_DATABASE_CHANGES_APPLIED ?? "") === "false" ? false : true,
      completeHistory: (process.env.STAGING_PLAN_COMPLETE_HISTORY ?? "") === "true",
      migrationCount,
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
    const artifactPath = process.env.STAGING_PLAN_ARTIFACT_PATH ?? "";
    if (artifactPath.trim() === "") throw new Error("artifact_path_missing");

    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(artifactPath, "utf8");
    const parsed = JSON.parse(raw);
    assertStagingPlanCertificationArtifact(parsed, {
      expectedTargetSha: process.env.TARGET_REF ?? "",
    });
    return;
  }
  throw new Error("unsupported_command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeReason = error instanceof Error && /^[a-z_]+$/.test(error.message)
      ? error.message
      : "validation_failed";
    console.error(safeReason);
    process.exitCode = 1;
  });
}
