import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
export const STAGING_USERNAME = `postgres.${STAGING_PROJECT_REF}`;
export const STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
export const STAGING_PORT = "5432";
export const STAGING_DATABASE = "postgres";
export const MAX_PLAN_ATTEMPTS = 3;

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
