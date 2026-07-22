import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_PLACEHOLDER,
  STAGING_DATABASE,
  STAGING_HOST,
  STAGING_PORT,
  STAGING_USERNAME,
  assembleStagingDatabaseUri,
  encodeDatabasePassword,
  sanitizePlanOutput,
  stagingSecretPresence,
  validateStagingTemplate,
} from "../../scripts/ci/supabase-staging-plan.mjs";

const template = `postgresql://${STAGING_USERNAME}:${PASSWORD_PLACEHOLDER}@${STAGING_HOST}:${STAGING_PORT}/${STAGING_DATABASE}`;
const validatorPath = resolve("scripts/ci/supabase-staging-plan.mjs");

function runValidator(command: string, environment: Record<string, string>) {
  return spawnSync(process.execPath, [validatorPath, command], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...environment,
    },
  });
}

describe("Supabase staging migration plan", () => {
  it("accepts only the exact staging Session pooler structure", () => {
    expect(validateStagingTemplate(template)).toEqual({ ok: true, reason: "ok" });
    expect(validateStagingTemplate(`${template}\r\n`)).toEqual({ ok: true, reason: "ok" });
    expect(validateStagingTemplate(template.replace("postgres.", "postgres%2E"))).toEqual({ ok: true, reason: "ok" });
    expect(validateStagingTemplate(template.replace(STAGING_USERNAME, "postgres.productionref123"))).toMatchObject({ reason: "invalid_username" });
    expect(validateStagingTemplate(template.replace(STAGING_HOST, "db.production.supabase.co"))).toMatchObject({ reason: "invalid_host" });
    expect(validateStagingTemplate(template.replace(`:${STAGING_PORT}/`, ":6543/"))).toMatchObject({ reason: "invalid_port" });
    expect(validateStagingTemplate(template.replace(`:${STAGING_PORT}/${STAGING_DATABASE}`, `:${STAGING_PORT}/production`))).toMatchObject({ reason: "invalid_database" });
    expect(validateStagingTemplate(template.replace(PASSWORD_PLACEHOLDER, "missing"))).toMatchObject({ reason: "missing_placeholder" });
    expect(validateStagingTemplate(template.replace(STAGING_USERNAME, `${STAGING_USERNAME}%20`))).toMatchObject({ reason: "invalid_username" });
    expect(validateStagingTemplate(template.replace(STAGING_HOST, STAGING_HOST.toUpperCase()))).toMatchObject({ reason: "invalid_host" });
    expect(validateStagingTemplate(`${template}?sslmode=require`)).toMatchObject({ reason: "invalid_database" });
  });

  it("encodes reserved and Unicode password characters without changing the target", () => {
    for (const password of [
      "space value",
      "p@ss:/?#[]{}!$&()*+,;=%",
      "quote\"single'backslash\\pipe|less<greater>",
      "unicode-ümlaut-雪",
    ]) {
      const uri = assembleStagingDatabaseUri(template, password);
      const parsed = new URL(uri);
      expect(decodeURIComponent(parsed.password)).toBe(password);
      expect(parsed.username).toBe(STAGING_USERNAME);
      expect(parsed.hostname).toBe(STAGING_HOST);
      expect(parsed.port).toBe(STAGING_PORT);
      expect(parsed.pathname).toBe(`/${STAGING_DATABASE}`);
    }
    expect(encodeDatabasePassword("a b")).toBe("a%20b");
  });

  it("reproduces an absent password safely before masking or encoding", () => {
    expect(stagingSecretPresence(template, "")).toEqual({
      uriTemplatePresent: true,
      passwordPresent: false,
    });
    expect(stagingSecretPresence("", "configured")).toEqual({
      uriTemplatePresent: false,
      passwordPresent: true,
    });
    expect(() => encodeDatabasePassword("")).toThrow("missing_password");
  });

  it("executes the exact workflow-to-validator preparation path offline", () => {
    const password = "offline $() ` ; & | ! ' \" \\ / spaces / % / ü / 雪";
    const encodedUsernameTemplate = `${template.replace("postgres.", "postgres%2E")}\r\n`;
    const environment = {
      SUPABASE_STAGING_DB_URI_TEMPLATE: encodedUsernameTemplate,
      SUPABASE_STAGING_DB_PASSWORD: password,
    };

    const preflight = runValidator("preflight", environment);
    expect(preflight.status).toBe(0);
    expect(preflight.stdout).toBe("uri_template_present=true\npassword_present=true\n");
    expect(preflight.stderr).toBe("");

    const encoded = runValidator("encode-password", environment);
    expect(encoded.status).toBe(0);
    expect(encoded.stderr).toBe("");
    expect(encoded.stdout).toBe(encodeDatabasePassword(password));

    const assembled = runValidator("assemble", environment);
    expect(assembled.status).toBe(0);
    expect(assembled.stderr).toBe("");
    const parsed = new URL(assembled.stdout);
    expect(decodeURIComponent(parsed.username)).toBe(STAGING_USERNAME);
    expect(decodeURIComponent(parsed.password)).toBe(password);
    expect(parsed.hostname).toBe(STAGING_HOST);
    expect(parsed.port).toBe(STAGING_PORT);
    expect(parsed.pathname).toBe(`/${STAGING_DATABASE}`);
  });

  it("redacts raw, encoded, assembled, and unexpected PostgreSQL connection strings", () => {
    const password = "mock password!";
    const encoded = encodeDatabasePassword(password);
    const uri = assembleStagingDatabaseUri(template, password);
    const output = `template=${template}\nraw=${password}\nencoded=${encoded}\nuri=${uri}\nother=postgresql://user:secret@host.invalid:5432/db`;
    const sanitized = sanitizePlanOutput(output, [template, password, encoded, uri]);
    expect(sanitized).not.toContain(password);
    expect(sanitized).not.toContain(encoded);
    expect(sanitized).not.toContain(uri);
    expect(sanitized).not.toContain("secret@host.invalid");
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).toContain("[REDACTED_DB_URI]");
  });

  it("defines a dispatch-only, target-pinned, protected and dry-run-only workflow", async () => {
    const workflow = await readFile(".github/workflows/supabase-staging-migration-plan.yml", "utf8");
    expect(workflow).toMatch(/^name: Supabase Staging Migration Plan$/m);
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:\n    inputs:\n      target_ref:/m);
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule|workflow_call):/m);
    expect(workflow).toMatch(/environment:\n\s+name: staging/);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 15");
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain('SUPABASE_CLI_VERSION: "2.109.1"');
    expect(workflow).toContain("ref: ${{ inputs.target_ref }}");
    expect(workflow).toContain("ref: refs/heads/main");
    expect(workflow).not.toContain("github.workflow_sha");
    expect(workflow).toContain('[[ "$TARGET_REF" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).toContain('test "$(git -C "$GITHUB_WORKSPACE/target" rev-parse HEAD)" = "$TARGET_REF"');
    expect(workflow).toContain("$GITHUB_WORKSPACE/control/scripts/ci/supabase-staging-plan.mjs");
    expect(workflow).toContain('--workdir "$GITHUB_WORKSPACE/target"');
    expect(workflow).toContain("SUPABASE_STAGING_DB_URI_TEMPLATE");
    expect(workflow).toContain("SUPABASE_STAGING_DB_PASSWORD");
    expect(workflow).toContain('AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED: "false"');
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("--include-all");
    expect(workflow.match(/ db push /g)).toHaveLength(2); // help capability check + one guarded dry run
    expect(workflow).not.toMatch(/supabase(?:@[^ ]+)?\s+link|migration\s+up|db\s+(reset|seed)|--linked|az\s+containerapp|vercel\s+deploy|worker:social/i);
    expect(workflow).not.toContain("upload-artifact");

    const preflight = workflow.indexOf("Preflight staging environment secret presence");
    const emptyGuard = workflow.indexOf('if [[ -z "$template" || -z "$password" ]]');
    const firstMask = workflow.indexOf("::add-mask::");
    const dryRun = workflow.indexOf("--dry-run", firstMask);
    expect(preflight).toBeGreaterThan(0);
    expect(emptyGuard).toBeGreaterThan(preflight);
    expect(firstMask).toBeGreaterThan(emptyGuard);
    expect(dryRun).toBeGreaterThan(firstMask);
    expect(workflow).toContain('node "$validator" preflight');
    expect(workflow).not.toContain("workflow_call:");
  });

  it("cannot silently execute an obsolete validator from a rerun workflow SHA", async () => {
    const workflow = await readFile(".github/workflows/supabase-staging-migration-plan.yml", "utf8");
    const trustedCheckout = workflow.slice(
      workflow.indexOf("Checkout trusted workflow controls"),
      workflow.indexOf("Checkout exact migration target"),
    );

    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(trustedCheckout).toContain("repository: AIOS-HQ/aios-platform");
    expect(trustedCheckout).toContain("ref: refs/heads/main");
    expect(trustedCheckout).not.toContain("github.workflow_sha");
    expect(workflow).toContain('current_main_sha="$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha)"');
    expect(workflow).toContain('test "$control_sha" = "$current_main_sha"');
    expect(workflow).toContain("TRUSTED_VALIDATOR_SHA256: ${{ steps.controls.outputs.validator_sha256 }}");
    expect(workflow.match(/sha256sum "\$validator"/g)).toHaveLength(4);
    expect(workflow.match(/git -C "\$GITHUB_WORKSPACE\/control" rev-parse HEAD/g)).toHaveLength(4);
    expect(workflow).toContain('test "$(git -C "$GITHUB_WORKSPACE/target" rev-parse HEAD)" = "$TARGET_REF"');
    expect(workflow).toContain('validator="$GITHUB_WORKSPACE/control/scripts/ci/supabase-staging-plan.mjs"');
    expect(workflow).not.toContain('$GITHUB_WORKSPACE/target/scripts/ci/supabase-staging-plan.mjs');
  });
});
