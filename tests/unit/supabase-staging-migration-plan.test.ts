import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STAGING_DATABASE,
  STAGING_HOST,
  STAGING_PORT,
  STAGING_PROJECT_REF,
  STAGING_USERNAME,
  assembleStagingDatabaseUri,
  encodeDatabasePassword,
  sanitizePlanOutput,
  trustedStagingPreflight,
} from "../../scripts/ci/supabase-staging-plan.mjs";

const validatorPath = resolve("scripts/ci/supabase-staging-plan.mjs");
const obsoleteUriTemplateSecret = ["SUPABASE", "STAGING", "DB", "URI", "TEMPLATE"].join("_");

function runValidator(command: string, environment: Record<string, string>) {
  return spawnSync(process.execPath, [validatorPath, command], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

describe("Supabase staging migration plan", () => {
  it("locks every non-secret connection component to the staging project", () => {
    expect(STAGING_PROJECT_REF).toBe("rorbiijpgahvwdrejpil");
    expect(STAGING_USERNAME).toBe("postgres.rorbiijpgahvwdrejpil");
    expect(STAGING_HOST).toBe("aws-0-ca-central-1.pooler.supabase.com");
    expect(STAGING_PORT).toBe("5432");
    expect(STAGING_DATABASE).toBe("postgres");
    expect(trustedStagingPreflight("configured")).toEqual({
      passwordPresent: true,
      targetProjectRefMatchesExpected: true,
      targetUsernameMatchesExpected: true,
      targetHostMatchesExpected: true,
      targetPortMatchesExpected: true,
      targetDatabaseMatchesExpected: true,
      uriConstructedInternally: true,
    });
  });

  it("constructs the URI internally from trusted constants and an encoded password", () => {
    for (const password of [
      "space value",
      "p@ss:/?#[]{}!$&()*+,;=%",
      "quote\"single'backslash\\pipe|less<greater>",
      "unicode-ümlaut-雪",
    ]) {
      const uri = assembleStagingDatabaseUri(password);
      const parsed = new URL(uri);
      expect(decodeURIComponent(parsed.password)).toBe(password);
      expect(parsed.username).toBe(STAGING_USERNAME);
      expect(parsed.hostname).toBe(STAGING_HOST);
      expect(parsed.port).toBe(STAGING_PORT);
      expect(parsed.pathname).toBe(`/${STAGING_DATABASE}`);
      expect(parsed.search).toBe("");
      expect(parsed.hash).toBe("");
    }
    expect(encodeDatabasePassword("a b")).toBe("a%20b");
  });

  it("fails closed for missing or empty passwords", () => {
    expect(trustedStagingPreflight("").passwordPresent).toBe(false);
    expect(() => encodeDatabasePassword("")).toThrow("missing_password");
    expect(() => assembleStagingDatabaseUri("")).toThrow("missing_password");

    const result = runValidator("preflight", { SUPABASE_STAGING_DB_PASSWORD: "" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("passwordPresent=false");
    expect(result.stderr).toBe("missing_password\n");
  });

  it("reports only deterministic booleans during preflight", () => {
    const password = "never-print-this-password";
    const result = runValidator("preflight", { SUPABASE_STAGING_DB_PASSWORD: password });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe([
      "passwordPresent=true",
      "targetProjectRefMatchesExpected=true",
      "targetUsernameMatchesExpected=true",
      "targetHostMatchesExpected=true",
      "targetPortMatchesExpected=true",
      "targetDatabaseMatchesExpected=true",
      "uriConstructedInternally=true",
      "",
    ].join("\n"));
    expect(result.stdout).not.toContain(password);
    expect(result.stdout).not.toContain(STAGING_HOST);
    expect(result.stdout).not.toContain(STAGING_USERNAME);
  });

  it("ignores an injected URI-template environment variable", () => {
    const password = "offline-special ! ü 雪";
    const result = runValidator("assemble", {
      SUPABASE_STAGING_DB_PASSWORD: password,
      [obsoleteUriTemplateSecret]: "postgresql://attacker:secret@host.invalid:9999/other",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = new URL(result.stdout);
    expect(parsed.username).toBe(STAGING_USERNAME);
    expect(parsed.hostname).toBe(STAGING_HOST);
    expect(parsed.port).toBe(STAGING_PORT);
    expect(parsed.pathname).toBe(`/${STAGING_DATABASE}`);
    expect(decodeURIComponent(parsed.password)).toBe(password);
    expect(result.stdout).not.toContain("attacker");
    expect(result.stdout).not.toContain("host.invalid");
  });

  it("redacts raw, encoded, assembled, and unexpected PostgreSQL connection strings", () => {
    const password = "mock password!";
    const encoded = encodeDatabasePassword(password);
    const uri = assembleStagingDatabaseUri(password);
    const output = `raw=${password}\nencoded=${encoded}\nuri=${uri}\nother=postgresql://user:secret@host.invalid:5432/db`;
    const sanitized = sanitizePlanOutput(output, [password, encoded, uri]);
    expect(sanitized).not.toContain(password);
    expect(sanitized).not.toContain(encoded);
    expect(sanitized).not.toContain(uri);
    expect(sanitized).not.toContain("secret@host.invalid");
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).toContain("[REDACTED_DB_URI]");
  });

  it("defines a dispatch-only, protected, target-pinned and dry-run-only workflow", async () => {
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
    expect(workflow).toContain("SUPABASE_STAGING_DB_PASSWORD");
    expect(workflow).not.toContain(obsoleteUriTemplateSecret);
    expect(workflow).not.toMatch(/STAGING_(?:HOST|USERNAME|PROJECT_REF|PORT|DATABASE):\s*\$\{\{/);
    expect(workflow).toContain('AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED: "false"');
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("--include-all");
    expect(workflow.match(/ db push /g)).toHaveLength(2);
    expect(workflow).not.toMatch(/supabase(?:@[^ ]+)?\s+link|migration\s+up|db\s+(reset|seed)|--linked|az\s+containerapp|vercel\s+deploy|worker:social/i);
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).not.toContain('printf "%s" "$database_uri"');

    const preflight = workflow.indexOf("Preflight trusted staging target and password");
    const emptyGuard = workflow.indexOf('if [[ -z "$password" ]]');
    const firstMask = workflow.indexOf("::add-mask::");
    const dryRun = workflow.indexOf("--dry-run", firstMask);
    expect(preflight).toBeGreaterThan(0);
    expect(emptyGuard).toBeGreaterThan(preflight);
    expect(firstMask).toBeGreaterThan(emptyGuard);
    expect(dryRun).toBeGreaterThan(firstMask);
    expect(workflow).toContain('node "$validator" preflight');
  });

  it("cannot silently execute untrusted controls or an obsolete validator", async () => {
    const workflow = await readFile(".github/workflows/supabase-staging-migration-plan.yml", "utf8");
    const trustedCheckout = workflow.slice(
      workflow.indexOf("Checkout trusted workflow controls"),
      workflow.indexOf("Checkout exact migration target"),
    );
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(trustedCheckout).toContain("repository: AIOS-HQ/aios-platform");
    expect(trustedCheckout).toContain("ref: refs/heads/main");
    expect(workflow).toContain('current_main_sha="$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha)"');
    expect(workflow).toContain('test "$control_sha" = "$current_main_sha"');
    expect(workflow).toContain("TRUSTED_VALIDATOR_SHA256: ${{ steps.controls.outputs.validator_sha256 }}");
    expect(workflow.match(/sha256sum "\$validator"/g)).toHaveLength(4);
    expect(workflow.match(/git -C "\$GITHUB_WORKSPACE\/control" rev-parse HEAD/g)).toHaveLength(4);
    expect(workflow).toContain('test "$(git -C "$GITHUB_WORKSPACE/target" rev-parse HEAD)" = "$TARGET_REF"');
    expect(workflow).not.toContain('$GITHUB_WORKSPACE/target/scripts/ci/supabase-staging-plan.mjs');
  });
});
