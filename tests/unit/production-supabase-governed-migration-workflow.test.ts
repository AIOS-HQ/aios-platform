import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/production-supabase-governed-migration.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production supabase governed migration workflow", () => {
  it("is workflow_dispatch only with immutable migration and promotion inputs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");

    expect(workflow).toContain("target_sha:");
    expect(workflow).toContain("promotion_artifact_id:");
    expect(workflow).toContain("first_migration_file:");
    expect(workflow).toContain("second_migration_file:");
    expect(workflow).toContain("promotion_request_id:");
    expect(workflow).toContain("20260807250000_production_promotion_approval_evidence.sql");
    expect(workflow).toContain("20260814010000_production_promotion_preview_waiver.sql");
    expect(workflow).toContain("first_migration_not_approved");
    expect(workflow).toContain("second_migration_not_approved");
    expect(workflow).toContain("promotion_request_id_mismatch");
  });

  it("pins production environment and trusted-main controls", () => {
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: production");
    expect(workflow).toContain("github.repository == 'AIOS-HQ/aios-platform'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("Checkout trusted workflow controls");
    expect(workflow).toContain('ref: refs/heads/main');
    expect(workflow).toContain("trusted_main_mismatch");
  });

  it("uses promotion attestation provenance checks and validates no bypass", () => {
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$PROMOTION_ARTIFACT_ID"');
    expect(workflow).toContain("promotion_source_run_not_success");
    expect(workflow).toContain("promotion_source_workflow_invalid");
    expect(workflow).toContain(".github/workflows/production-promotion-attestation.yml");
    expect(workflow).toContain("promotion_source_event_invalid");
    expect(workflow).toContain("promotion_source_sha_mismatch");
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$PROMOTION_ARTIFACT_ID/zip" > promotion-artifact.zip');
    expect(workflow).toContain("scripts/ci/promotion-attestation-contract.mjs validate");
  });

  it("enforces dry-run then scoped apply and blocks unrelated range migrations", () => {
    expect(workflow).toContain("unapproved_migrations_in_range");
    expect(workflow).toContain("scoped_workdir");
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("production_migration_dry_run_failed");
    expect(workflow).toContain("production_migration_apply_failed");
    expect(workflow).toContain("migration_range_already_applied");
    expect(workflow).toContain("migration_range_not_fully_applied");
    expect(workflow).toContain("supabase_migrations.schema_migrations");
  });

  it("produces immutable evidence and read-only post-apply diagnostic only", () => {
    expect(workflow).toContain("supabase-production-governed-migration.mjs");
    expect(workflow).toContain("write-artifact");
    expect(workflow).toContain("validate-artifact");
    expect(workflow).toContain("supabase-production-governed-migration-${{ inputs.target_sha }}-${{ github.run_id }}");
    expect(workflow).toContain("run-production-promotion-persistence-diagnostic.ts");
    expect(workflow).toContain("production-promotion-persistence-diagnostic-after-migration");
    expect(workflow).not.toContain("azure/login");
    expect(workflow).not.toContain("az containerapp");
    expect(workflow).not.toContain("docker push");
    expect(workflow).not.toContain("deploy");
  });

  it("requires production db password and keeps service role key to post-verify", () => {
    expect(workflow).toContain("SUPABASE_PRODUCTION_DB_PASSWORD");
    expect(workflow).toContain("SUPABASE_URL: ${{ secrets.SUPABASE_URL }}");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
  });
});

