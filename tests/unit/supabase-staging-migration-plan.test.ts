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
  MAX_PLAN_ATTEMPTS,
  assertStagingPlanCertificationArtifact,
  buildStagingPlanCertificationArtifact,
  assembleStagingDatabaseUri,
  classifyPlanAttemptFailure,
  encodeDatabasePassword,
  runPlanWithTransientRetry,
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

  it("succeeds on the first plan attempt without sleeping", async () => {
    const attempts: number[] = [];
    const delays: number[] = [];
    const result = await runPlanWithTransientRetry(
      async (attempt) => {
        attempts.push(attempt);
        return { status: 0, output: "migration plan complete" };
      },
      { sleep: async (delay) => { delays.push(delay); } },
    );
    expect(result).toMatchObject({ status: 0, attemptCount: 1, classification: null });
    expect(attempts).toEqual([1]);
    expect(delays).toEqual([]);
  });

  it("retries transient DNS failure and then succeeds", async () => {
    const attempts: number[] = [];
    const delays: number[] = [];
    const result = await runPlanWithTransientRetry(
      async (attempt) => {
        attempts.push(attempt);
        return attempt === 1
          ? { status: 1, output: "SQLSTATE XX000 getaddrinfo ENOTFOUND trusted-host" }
          : { status: 0, output: "migration plan complete" };
      },
      { sleep: async (delay) => { delays.push(delay); } },
    );
    expect(result).toMatchObject({ status: 0, attemptCount: 2, classification: null });
    expect(attempts).toEqual([1, 2]);
    expect(delays).toEqual([2_000]);
  });

  it("fails closed after the bounded transient DNS attempt limit", async () => {
    const attempts: number[] = [];
    const delays: number[] = [];
    const result = await runPlanWithTransientRetry(
      async (attempt) => {
        attempts.push(attempt);
        return { status: 1, output: "getaddrinfo EAI_AGAIN trusted-host" };
      },
      { sleep: async (delay) => { delays.push(delay); } },
    );
    expect(MAX_PLAN_ATTEMPTS).toBe(3);
    expect(result).toMatchObject({
      status: 1,
      attemptCount: 3,
      classification: { retryable: true, safeCode: "transient_dns_failure" },
    });
    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([2_000, 4_000]);
  });

  it.each([
    ["password authentication failed", "authentication_failed"],
    ["SQLSTATE 42P01 migration plan failed", "migration_plan_failed"],
    ["x509 certificate validation failed", "tls_validation_failed"],
    ["tenant or user not found", "project_identity_mismatch"],
  ])("does not retry non-transient failure: %s", async (output, safeCode) => {
    let calls = 0;
    const result = await runPlanWithTransientRetry(async () => {
      calls += 1;
      return { status: 1, output };
    }, { sleep: async () => { throw new Error("unexpected_sleep"); } });
    expect(calls).toBe(1);
    expect(result.classification).toEqual({ retryable: false, safeCode });
  });

  it("returns safe classifications without echoing credentials or database URIs", () => {
    const sensitiveOutput = "getaddrinfo ENOTFOUND postgresql://user:secret@trusted-host:5432/postgres";
    expect(classifyPlanAttemptFailure(sensitiveOutput)).toEqual({
      retryable: true,
      safeCode: "transient_dns_failure",
    });
    const sanitized = sanitizePlanOutput(sensitiveOutput, ["secret"]);
    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("postgresql://");
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
    expect(workflow).toContain("max_attempts=3");
    expect(workflow).toContain('node "$validator" classify-attempt');
    expect(workflow).toContain('[[ "$classification_status" -eq 75 && "$attempt" -lt "$max_attempts" ]]');
    expect(workflow).toContain("retry_delay=$((2 ** attempt))");
    expect(workflow).toContain('printf \'staging_plan_failed code=%s attempts=%s\\n\'');
    expect(workflow).not.toMatch(/supabase(?:@[^ ]+)?\s+link|migration\s+up|db\s+(reset|seed)|--linked|az\s+containerapp|vercel\s+deploy|worker:social/i);
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
    expect(workflow.match(/sha256sum "\$validator"/g)).toHaveLength(6);
    expect(workflow.match(/git -C "\$GITHUB_WORKSPACE\/control" rev-parse HEAD/g)).toHaveLength(6);
    expect(workflow).toContain('test "$(git -C "$GITHUB_WORKSPACE/target" rev-parse HEAD)" = "$TARGET_REF"');
    expect(workflow).not.toContain('$GITHUB_WORKSPACE/target/scripts/ci/supabase-staging-plan.mjs');
  });

  it("builds, validates, and uploads an immutable safe staging certification artifact", async () => {
    const workflow = await readFile(".github/workflows/supabase-staging-migration-plan.yml", "utf8");
    expect(workflow).toContain('- name: Verify immutable target and trusted controls\n        id: target_validation');
    expect(workflow).toContain('test "$migration_count" -gt 0');
    expect(workflow).toContain("printf 'migration_count=%s\\n' \"$migration_count\" >>\"$GITHUB_OUTPUT\"");
    expect(workflow).toContain("MIGRATION_COUNT: ${{ steps.target_validation.outputs.migration_count }}");
    expect(workflow).not.toContain("steps.checkout_target.outputs.migration_count");
    expect(workflow).toContain("Build immutable staging migration certification artifact");
    expect(workflow).toContain("Validate staging migration certification artifact");
    expect(workflow).toContain("Upload safe staging migration certification artifact");
    expect(workflow).toContain("node \"$validator\" write-artifact");
    expect(workflow).toContain("node \"$validator\" validate-artifact");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("supabase-staging-migration-plan-${{ inputs.target_ref }}-${{ github.run_id }}");
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("builds a canonical immutable staging migration-plan certification artifact", () => {
    const artifact = buildStagingPlanCertificationArtifact({
      repository: "AIOS-HQ/aios-platform",
      targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      environment: "staging",
      result: "passed",
      mode: "dry_run",
      databaseChangesApplied: false,
      completeHistory: true,
      migrationCount: 58,
      trustedControlSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      validatorSha256: "a".repeat(64),
      runId: "123456789",
      runAttempt: "1",
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/supabase-staging-migration-plan.yml@refs/heads/main",
      verifiedAt: "2026-08-08T12:00:00.000Z",
    });

    expect(artifact).toMatchObject({
      certification: "supabase-staging-migration-plan",
      repository: "AIOS-HQ/aios-platform",
      targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      environment: "staging",
      result: "passed",
      mode: "dry_run",
      databaseChangesApplied: false,
      completeHistory: true,
      migrationCount: 58,
    });
    expect(assertStagingPlanCertificationArtifact(artifact, {
      expectedTargetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
    })).toBe(true);
  });

  it("fails closed on repository/environment/result/target mismatches", () => {
    const base = {
      certification: "supabase-staging-migration-plan",
      repository: "AIOS-HQ/aios-platform",
      targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      environment: "staging",
      result: "passed",
      mode: "dry_run",
      databaseChangesApplied: false,
      completeHistory: true,
      migrationCount: 58,
      trustedControlSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      validatorSha256: "a".repeat(64),
      workflowRun: { runId: "123", runAttempt: 1, workflowRef: "ref" },
      verifiedAt: "2026-08-08T12:00:00.000Z",
    };

    expect(() => assertStagingPlanCertificationArtifact({ ...base, repository: "other/repo" })).toThrow(/repository_mismatch/);
    expect(() => assertStagingPlanCertificationArtifact({ ...base, environment: "production" })).toThrow(/environment_mismatch/);
    expect(() => assertStagingPlanCertificationArtifact({ ...base, result: "failed" })).toThrow(/result_mismatch/);
    expect(() => assertStagingPlanCertificationArtifact({ ...base, targetSha: "deadbeef" })).toThrow(/target_sha_invalid/);
    expect(() => assertStagingPlanCertificationArtifact(base, { expectedTargetSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toThrow(/target_sha_mismatch/);
  });

  it("fails closed on migration count and control identity invalid values", () => {
    expect(() =>
      buildStagingPlanCertificationArtifact({
        repository: "AIOS-HQ/aios-platform",
        targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
        environment: "staging",
        result: "passed",
        mode: "dry_run",
        databaseChangesApplied: false,
        completeHistory: true,
        migrationCount: 0,
        trustedControlSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
        validatorSha256: "a".repeat(64),
        runId: "123456",
        runAttempt: "1",
        workflowRef: "ref",
        verifiedAt: "2026-08-08T12:00:00.000Z",
      }),
    ).toThrow(/migration_count_invalid/);

    expect(() =>
      buildStagingPlanCertificationArtifact({
        repository: "AIOS-HQ/aios-platform",
        targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
        environment: "staging",
        result: "passed",
        mode: "dry_run",
        databaseChangesApplied: false,
        completeHistory: true,
        migrationCount: 58,
        trustedControlSha: "bad",
        validatorSha256: "short",
        runId: "abc",
        runAttempt: "x",
        workflowRef: "",
        verifiedAt: "not-a-time",
      }),
    ).toThrow();
  });

  it("fails closed on sensitive key/value presence", () => {
    const base = {
      certification: "supabase-staging-migration-plan",
      repository: "AIOS-HQ/aios-platform",
      targetSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      environment: "staging",
      result: "passed",
      mode: "dry_run",
      databaseChangesApplied: false,
      completeHistory: true,
      migrationCount: 58,
      trustedControlSha: "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300",
      validatorSha256: "a".repeat(64),
      workflowRun: { runId: "123", runAttempt: 1, workflowRef: "ref" },
      verifiedAt: "2026-08-08T12:00:00.000Z",
    };
    expect(() => assertStagingPlanCertificationArtifact({ ...base, db_url: "postgres://x" })).toThrow(/sensitive_key_rejected/);
    expect(() => assertStagingPlanCertificationArtifact({ ...base, note: "postgresql://user:pass@host/db" })).toThrow(/sensitive_value_rejected/);
  });
});
