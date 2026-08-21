import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  APPROVED_FIRST_MIGRATION_FILE,
  APPROVED_SECOND_MIGRATION_FILE,
  PRODUCTION_DATABASE,
  PRODUCTION_HOST,
  PRODUCTION_PORT,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
  PRODUCTION_USERNAME,
  assembleProductionDatabaseUri,
  assertProductionMigrationEvidenceArtifact,
  buildProductionMigrationEvidenceArtifact,
  encodeDatabasePassword,
  extractProjectRefFromSupabaseUrl,
  sanitizeCommandOutput,
  trustedProductionPreflight,
} from "../../scripts/ci/supabase-production-governed-migration.mjs";

const validatorPath = "scripts/ci/supabase-production-governed-migration.mjs";

function runValidator(command: string, environment: Record<string, string>) {
  return spawnSync(process.execPath, [validatorPath, command], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

describe("Supabase production governed migration", () => {
  it("locks approved project and migration range constants", () => {
    expect(PRODUCTION_PROJECT_REF).toBe("vgsqgxpwjnwssconsptn");
    expect(PRODUCTION_USERNAME).toBe("postgres.vgsqgxpwjnwssconsptn");
    expect(PRODUCTION_HOST).toBe("db.vgsqgxpwjnwssconsptn.supabase.co");
    expect(PRODUCTION_PORT).toBe("5432");
    expect(PRODUCTION_DATABASE).toBe("postgres");
    expect(APPROVED_FIRST_MIGRATION_FILE).toBe("20260807250000_production_promotion_approval_evidence.sql");
    expect(APPROVED_SECOND_MIGRATION_FILE).toBe("20260814010000_production_promotion_preview_waiver.sql");
    expect(PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID).toBe("promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a");
  });

  it("constructs production db URI internally from trusted constants", () => {
    const password = "prod! p@ss:/?#[]{}";
    const uri = assembleProductionDatabaseUri(password);
    const parsed = new URL(uri);
    expect(parsed.username).toBe(PRODUCTION_USERNAME);
    expect(parsed.hostname).toBe(PRODUCTION_HOST);
    expect(parsed.port).toBe(PRODUCTION_PORT);
    expect(parsed.pathname).toBe(`/${PRODUCTION_DATABASE}`);
    expect(decodeURIComponent(parsed.password)).toBe(password);
    expect(encodeDatabasePassword("a b")).toBe("a%20b");
  });

  it("fails closed when password or Supabase URL identity is missing/invalid", () => {
    const missingPassword = runValidator("preflight", {
      SUPABASE_PRODUCTION_DB_PASSWORD: "",
      SUPABASE_URL: "https://vgsqgxpwjnwssconsptn.supabase.co",
    });
    expect(missingPassword.status).toBe(1);
    expect(missingPassword.stderr).toBe("missing_password\n");

    const mismatchedUrl = runValidator("preflight", {
      SUPABASE_PRODUCTION_DB_PASSWORD: "configured",
      SUPABASE_URL: "https://rorbijjpgahvwdrejpil.supabase.co",
    });
    expect(mismatchedUrl.status).toBe(1);
    expect(mismatchedUrl.stderr).toBe("supabase_project_ref_mismatch\n");
  });

  it("reports deterministic boolean preflight output only", () => {
    const result = runValidator("preflight", {
      SUPABASE_PRODUCTION_DB_PASSWORD: "never-print",
      SUPABASE_URL: "https://vgsqgxpwjnwssconsptn.supabase.co",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("passwordPresent=true");
    expect(result.stdout).toContain("supabaseUrlProjectRefMatchesExpected=true");
    expect(result.stdout).toContain("targetHostMatchesExpected=true");
    expect(result.stdout).not.toContain("never-print");
    expect(result.stdout).not.toContain(PRODUCTION_HOST);
  });

  it("extracts Supabase project refs safely", () => {
    expect(extractProjectRefFromSupabaseUrl("https://vgsqgxpwjnwssconsptn.supabase.co")).toBe("vgsqgxpwjnwssconsptn");
    expect(extractProjectRefFromSupabaseUrl("https://example.com")).toBeNull();
    expect(extractProjectRefFromSupabaseUrl("not-a-url")).toBeNull();
  });

  it("redacts secret material from command output", () => {
    const password = "secret password";
    const encoded = encodeDatabasePassword(password);
    const uri = assembleProductionDatabaseUri(password);
    const unexpectedUri = "postgresql://other:unsafe@db.example.invalid:5432/postgres";
    const output = `password=${password}\nencoded=${encoded}\nuri=${uri}\nunexpected=${unexpectedUri}\n`;

    const sanitized = sanitizeCommandOutput(output, [password, encoded, uri]);
    expect(sanitized).not.toContain(password);
    expect(sanitized).not.toContain(encoded);
    expect(sanitized).not.toContain(uri);
    expect(sanitized).not.toContain(unexpectedUri);
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).toContain("[REDACTED_DB_URI]");
  });

  it("builds and validates immutable migration evidence artifact", () => {
    const artifact = buildProductionMigrationEvidenceArtifact({
      repository: "AIOS-HQ/aios-platform",
      environment: "production",
      result: "passed",
      mode: "apply",
      targetSha: "f313bf46b6283e3cb61004efebf4cb77912507b6",
      firstMigrationFile: APPROVED_FIRST_MIGRATION_FILE,
      secondMigrationFile: APPROVED_SECOND_MIGRATION_FILE,
      dryRunValidated: true,
      applyExecuted: true,
      unrelatedPendingMigrations: false,
      projectRef: PRODUCTION_PROJECT_REF,
      projectIdentityVerified: true,
      promotionArtifactId: "12345",
      promotionArtifactName: "promotion-attestation-f313bf46b6283e3cb61004efebf4cb77912507b6-12345",
      promotionWorkflowRunId: "12345",
      promotionWorkflowRunAttempt: "1",
      promotionWorkflowRef: "AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@f313bf46b6283e3cb61004efebf4cb77912507b6#run:12345:attempt:1",
      appliedMigrationVersions: "20260807250000,20260814010000",
      trustedControlSha: "f313bf46b6283e3cb61004efebf4cb77912507b6",
      validatorSha256: "a".repeat(64),
      runId: "67890",
      runAttempt: "1",
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/production-supabase-governed-migration.yml@f313bf46b6283e3cb61004efebf4cb77912507b6",
      verifiedAt: "2026-08-21T23:00:00.000Z",
    });

    expect(() => assertProductionMigrationEvidenceArtifact(artifact, {
      expectedTargetSha: "f313bf46b6283e3cb61004efebf4cb77912507b6",
      expectedFirstMigrationFile: APPROVED_FIRST_MIGRATION_FILE,
      expectedSecondMigrationFile: APPROVED_SECOND_MIGRATION_FILE,
    })).not.toThrow();
  });

  it("fails closed when unrelated pending migrations are reported", () => {
    expect(() => buildProductionMigrationEvidenceArtifact({
      repository: "AIOS-HQ/aios-platform",
      environment: "production",
      result: "passed",
      mode: "apply",
      targetSha: "f313bf46b6283e3cb61004efebf4cb77912507b6",
      firstMigrationFile: APPROVED_FIRST_MIGRATION_FILE,
      secondMigrationFile: APPROVED_SECOND_MIGRATION_FILE,
      dryRunValidated: true,
      applyExecuted: true,
      unrelatedPendingMigrations: true,
      projectRef: PRODUCTION_PROJECT_REF,
      projectIdentityVerified: true,
      promotionArtifactId: "12345",
      promotionArtifactName: "promotion-attestation-f313bf46b6283e3cb61004efebf4cb77912507b6-12345",
      promotionWorkflowRunId: "12345",
      promotionWorkflowRunAttempt: "1",
      promotionWorkflowRef: "AIOS-HQ/aios-platform/.github/workflows/production-promotion-attestation.yml@f313bf46b6283e3cb61004efebf4cb77912507b6#run:12345:attempt:1",
      appliedMigrationVersions: "20260807250000",
      trustedControlSha: "f313bf46b6283e3cb61004efebf4cb77912507b6",
      validatorSha256: "a".repeat(64),
      runId: "67890",
      runAttempt: "1",
      workflowRef: "AIOS-HQ/aios-platform/.github/workflows/production-supabase-governed-migration.yml@f313bf46b6283e3cb61004efebf4cb77912507b6",
      verifiedAt: "2026-08-21T23:00:00.000Z",
    })).toThrow("unrelated_pending_migrations_detected");
  });

  it("preflight helper reports expected booleans", () => {
    expect(trustedProductionPreflight("configured", "https://vgsqgxpwjnwssconsptn.supabase.co")).toMatchObject({
      passwordPresent: true,
      supabaseUrlPresent: true,
      supabaseUrlProjectRefMatchesExpected: true,
      targetProjectRefMatchesExpected: true,
      uriConstructedInternally: true,
    });
  });
});
