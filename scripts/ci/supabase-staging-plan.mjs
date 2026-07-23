import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
export const STAGING_USERNAME = `postgres.${STAGING_PROJECT_REF}`;
export const STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
export const STAGING_PORT = "5432";
export const STAGING_DATABASE = "postgres";

const EXPECTED_STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
const EXPECTED_STAGING_USERNAME = "postgres.rorbiijpgahvwdrejpil";
const EXPECTED_STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
const EXPECTED_STAGING_PORT = "5432";
const EXPECTED_STAGING_DATABASE = "postgres";

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
