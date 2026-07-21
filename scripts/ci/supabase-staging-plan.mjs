import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "rorbiijpgahvwdrejpil";
export const STAGING_USERNAME = `postgres.${STAGING_PROJECT_REF}`;
export const STAGING_HOST = "aws-0-ca-central-1.pooler.supabase.com";
export const STAGING_PORT = "5432";
export const STAGING_DATABASE = "postgres";
export const PASSWORD_PLACEHOLDER = "[YOUR-PASSWORD]";

export function validateStagingTemplate(template) {
  if (typeof template !== "string" || template.split(PASSWORD_PLACEHOLDER).length !== 2) {
    return { ok: false, reason: "missing_placeholder" };
  }
  if (template !== template.trim()) return { ok: false, reason: "parse_failure" };
  const match = template.match(/^postgresql:\/\/([^:@/?#]+):\[YOUR-PASSWORD\]@([^:/?#]+):([^/?#]+)\/([^?#]+)$/);
  if (!match) return { ok: false, reason: "parse_failure" };
  const [, username, hostname, port, database] = match;
  if (username !== STAGING_USERNAME) return { ok: false, reason: "invalid_username" };
  if (hostname !== STAGING_HOST) return { ok: false, reason: "invalid_host" };
  if (port !== STAGING_PORT) return { ok: false, reason: "invalid_port" };
  if (database !== STAGING_DATABASE) return { ok: false, reason: "invalid_database" };
  return { ok: true, reason: "ok" };
}

export function encodeDatabasePassword(password) {
  if (typeof password !== "string" || password.length === 0) throw new Error("missing_password");
  return encodeURIComponent(password).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function stagingSecretPresence(template, password) {
  return {
    uriTemplatePresent: typeof template === "string" && template.length > 0,
    passwordPresent: typeof password === "string" && password.length > 0,
  };
}

export function assembleStagingDatabaseUri(template, password) {
  const validation = validateStagingTemplate(template);
  if (!validation.ok) throw new Error(validation.reason);
  return template.replace(PASSWORD_PLACEHOLDER, encodeDatabasePassword(password));
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
    const presence = stagingSecretPresence(
      process.env.SUPABASE_STAGING_DB_URI_TEMPLATE,
      process.env.SUPABASE_STAGING_DB_PASSWORD,
    );
    console.info(`uri_template_present=${presence.uriTemplatePresent}`);
    console.info(`password_present=${presence.passwordPresent}`);
    if (!presence.uriTemplatePresent || !presence.passwordPresent) {
      throw new Error("missing_staging_environment_secret");
    }
    return;
  }
  if (command === "assemble") {
    process.stdout.write(assembleStagingDatabaseUri(
      process.env.SUPABASE_STAGING_DB_URI_TEMPLATE ?? "",
      process.env.SUPABASE_STAGING_DB_PASSWORD ?? "",
    ));
    return;
  }
  if (command === "encode-password") {
    process.stdout.write(encodeDatabasePassword(process.env.SUPABASE_STAGING_DB_PASSWORD ?? ""));
    return;
  }
  if (command === "sanitize") {
    const output = await readStandardInput();
    process.stdout.write(sanitizePlanOutput(output, [
      process.env.SUPABASE_STAGING_DB_URI_TEMPLATE,
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
