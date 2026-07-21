import { readFile } from "node:fs/promises";
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
  validateStagingTemplate,
} from "../../scripts/ci/supabase-staging-plan.mjs";

const template = `postgresql://${STAGING_USERNAME}:${PASSWORD_PLACEHOLDER}@${STAGING_HOST}:${STAGING_PORT}/${STAGING_DATABASE}`;

describe("Supabase staging migration plan", () => {
  it("accepts only the exact staging Session pooler structure", () => {
    expect(validateStagingTemplate(template)).toEqual({ ok: true, reason: "ok" });
    expect(validateStagingTemplate(template.replace(STAGING_USERNAME, "postgres.productionref123"))).toMatchObject({ reason: "invalid_username" });
    expect(validateStagingTemplate(template.replace(STAGING_HOST, "db.production.supabase.co"))).toMatchObject({ reason: "invalid_host" });
    expect(validateStagingTemplate(template.replace(`:${STAGING_PORT}/`, ":6543/"))).toMatchObject({ reason: "invalid_port" });
    expect(validateStagingTemplate(template.replace(`:${STAGING_PORT}/${STAGING_DATABASE}`, `:${STAGING_PORT}/production`))).toMatchObject({ reason: "invalid_database" });
    expect(validateStagingTemplate(template.replace(PASSWORD_PLACEHOLDER, "missing"))).toMatchObject({ reason: "missing_placeholder" });
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

  it("defines a dispatch-only, protected, immutable and dry-run-only workflow", async () => {
    const workflow = await readFile(".github/workflows/supabase-staging-migration-plan.yml", "utf8");
    expect(workflow).toMatch(/^name: Supabase Staging Migration Plan$/m);
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:\s*$/m);
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 15");
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain('SUPABASE_CLI_VERSION: "2.109.1"');
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("SUPABASE_STAGING_DB_URI_TEMPLATE");
    expect(workflow).toContain("SUPABASE_STAGING_DB_PASSWORD");
    expect(workflow).toContain('AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED: "false"');
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("--include-all");
    expect(workflow.match(/ db push /g)).toHaveLength(2); // help capability check + one guarded dry run
    expect(workflow).not.toMatch(/supabase(?:@[^ ]+)?\s+link|migration\s+up|db\s+(reset|seed)|--linked|az\s+containerapp|vercel\s+deploy/i);
    expect(workflow).not.toContain("upload-artifact");
  });
});
