import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/production-supabase-governed-migration.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production supabase governed migration workflow", () => {
  it("is workflow_dispatch only with immutable migration and authorization inputs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");

    expect(workflow).toContain("target_sha:");
    expect(workflow).toContain("authorization_mode:");
    expect(workflow).toContain("promotion_attestation");
    expect(workflow).toContain("bootstrap_staging_migration_plan");
    expect(workflow).toContain("promotion_artifact_id:");
    expect(workflow).toContain("staging_migration_artifact_id:");
    expect(workflow).toContain("first_migration_file:");
    expect(workflow).toContain("second_migration_file:");
    expect(workflow).toContain("promotion_request_id:");
    expect(workflow).toContain("first_migration_not_approved");
    expect(workflow).toContain("second_migration_not_approved");
    expect(workflow).toContain("promotion_request_id_mismatch");
    expect(workflow).toContain("authorization_mode_invalid");
    expect(workflow).toContain("promotion_artifact_id_not_allowed");
    expect(workflow).toContain("staging_migration_artifact_id_not_allowed");
  });

  it("pins production environment and trusted-main controls", () => {
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: production");
    expect(workflow).toContain("github.repository == 'AIOS-HQ/aios-platform'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("Checkout trusted workflow controls");
    expect(workflow).toContain("ref: refs/heads/main");
    expect(workflow).toContain("trusted_main_mismatch");
  });

  it("preserves normal promotion attestation authorization path", () => {
    expect(workflow).toContain('if [[ "$AUTHORIZATION_MODE" == "promotion_attestation" ]]; then');
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$PROMOTION_ARTIFACT_ID"');
    expect(workflow).toContain("promotion_source_run_not_success");
    expect(workflow).toContain("promotion_source_workflow_invalid");
    expect(workflow).toContain(".github/workflows/production-promotion-attestation.yml");
    expect(workflow).toContain("promotion_source_event_invalid");
    expect(workflow).toContain("promotion_source_sha_mismatch");
    expect(workflow).toContain("scripts/ci/promotion-attestation-contract.mjs validate");
  });

  it("adds bootstrap staging migration authorization path with strict provenance", () => {
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$STAGING_MIGRATION_ARTIFACT_ID"');
    expect(workflow).toContain("staging_migration_source_run_not_success");
    expect(workflow).toContain("staging_migration_source_workflow_invalid");
    expect(workflow).toContain(".github/workflows/supabase-staging-migration-plan.yml");
    expect(workflow).toContain("staging_migration_source_event_invalid");
    expect(workflow).toContain("staging_migration_artifact_name_invalid");
    expect(workflow).toContain("supabase-staging-migration-plan-${TARGET_SHA}-${source_run_id}");
    expect(workflow).toContain("assertStagingPlanCertificationArtifact");
    expect(workflow).toContain("staging_migration_certification_name_invalid");
    expect(workflow).toContain("staging_migration_target_sha_mismatch");
  });

  it("enforces bootstrap-only schema absence and scoped migration range", () => {
    expect(workflow).toContain("bootstrap_schema_already_present");
    expect(workflow).toContain("promotion_schema_missing_for_normal_mode");
    expect(workflow).toContain("bootstrap_migration_state_not_pristine");
    expect(workflow).toContain("unapproved_migrations_in_range");
    expect(workflow).toContain("scoped_workdir");
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("production_migration_dry_run_failed");
    expect(workflow).toContain("production_migration_apply_failed");
    expect(workflow).toContain("migration_range_not_fully_applied");
    expect(workflow).toContain("to_regclass('public.production_promotion_requests')");
    expect(workflow).toContain("to_regclass('public.production_promotion_decisions')");
  });

  it("produces immutable evidence and read-only post-apply diagnostic only", () => {
    expect(workflow).toContain("supabase-production-governed-migration.mjs");
    expect(workflow).toContain("write-artifact");
    expect(workflow).toContain("validate-artifact");
    expect(workflow).toContain("PRODUCTION_MIGRATION_AUTHORIZATION_MODE");
    expect(workflow).toContain("STAGING_MIGRATION_CERTIFICATION_NAME");
    expect(workflow).toContain("run-production-promotion-persistence-diagnostic.ts");
    expect(workflow).toContain("production-promotion-persistence-diagnostic-after-migration");
    expect(workflow).not.toContain("azure/login");
    expect(workflow).not.toContain("az containerapp");
    expect(workflow).not.toContain("docker push");
  });
});
