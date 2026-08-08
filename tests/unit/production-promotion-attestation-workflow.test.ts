import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/production-promotion-attestation.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production promotion attestation workflow", () => {
  it("is workflow_dispatch only with required immutable inputs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("target_sha:");
    expect(workflow).toContain("promotion_request_id:");
    expect(workflow).toContain("runtime_artifact_id:");
    expect(workflow).toContain("migration_artifact_id:");
    expect(workflow).toContain("required: true");
  });

  it("locks permissions and trusted-main controls", () => {
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("github.repository == 'AIOS-HQ/aios-platform'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("git fetch --no-tags --prune origin main");
    expect(workflow).toContain("trusted_main_mismatch");
  });

  it("fails closed on immutable input validation", () => {
    expect(workflow).toContain("^[0-9a-f]{40}$");
    expect(workflow).toContain("^[1-9][0-9]*$");
    expect(workflow).toContain("promotion_request_id_mutable_alias");
    expect(workflow).toContain("latest");
    expect(workflow).toContain("head");
  });

  it("uses exact numeric artifact IDs and canonical source workflow paths", () => {
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$RUNTIME_ARTIFACT_ID"');
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$MIGRATION_ARTIFACT_ID"');
    expect(workflow).toContain("runtime_artifact_expired");
    expect(workflow).toContain("migration_artifact_expired");
    expect(workflow).toContain("runtime_workflow_not_success");
    expect(workflow).toContain("migration_workflow_not_success");
    expect(workflow).toContain(".github/workflows/operational-preview-live-certification.yml");
    expect(workflow).toContain(".github/workflows/supabase-staging-migration-plan.yml");
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$RUNTIME_ARTIFACT_ID/zip" > runtime-artifact.zip');
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$MIGRATION_ARTIFACT_ID/zip" > migration-artifact.zip');
    expect(workflow).not.toContain("download-artifact@v");
    expect(workflow).toContain("promotion_request_id_mutable_alias");
  });

  it("composes, exports, validates and uploads immutable final attestation", () => {
    expect(workflow).toContain("scripts/ci/staging-promotion-evidence.mjs");
    expect(workflow).toContain("scripts/ci/export-persisted-promotion-approval-evidence.ts");
    expect(workflow).toContain("scripts/ci/produce-promotion-attestation.mjs");
    expect(workflow).toContain("scripts/ci/promotion-attestation-contract.mjs validate promotion-attestation.json");
    expect(workflow).toContain("promotion-attestation-${{ inputs.target_sha }}-${{ github.run_id }}");
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("limits Supabase secrets to exporter step and has no deployment/azure actions", () => {
    const exporterSection = workflow.split("- name: Export persisted promotion approvals")[1].split("- name:")[0];
    expect(exporterSection).toContain("SUPABASE_URL");
    expect(exporterSection).toContain("SUPABASE_SERVICE_ROLE_KEY");

    const beforeExporter = workflow.split("- name: Export persisted promotion approvals")[0];
    const afterExporter = workflow.split("- name: Export persisted promotion approvals")[1].split("- name: Produce final promotion attestation")[1];
    expect(beforeExporter).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(afterExporter).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    expect(workflow).not.toContain("azure");
    expect(workflow).not.toContain("vercel");
    expect(workflow).not.toContain("deployment");
  });
});
