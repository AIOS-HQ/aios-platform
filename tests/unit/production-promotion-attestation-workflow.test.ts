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
    expect(workflow).toContain("required: false");
    expect(workflow).toContain("preview_certification_waiver:");
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
    expect(workflow).toContain("preview_certification_waiver_invalid");
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
    expect(workflow).toContain(".github/workflows/launch-validation.yml");
    expect(workflow).toContain("waiver_launch_validation_not_success");
    expect(workflow).toContain("runtime_run_attempt=\"$(jq -r '[.workflow_runs[] | select(.id == ('\"$launch_run_id\"'|tonumber))][0].run_attempt // 1' <<<\"$launch_runs_json\")\"");
    expect(workflow).toContain("if [[ \"$PREVIEW_CERTIFICATION_WAIVER\" == \"false\" ]]; then");
    expect(workflow).toContain("runtime_run_attempt=\"$(jq -r '.run_attempt' <<<\"$runtime_run_json\")\"");
    expect(workflow).toContain("waiver_preview_deployment_not_found");
    expect(workflow).toContain("waiver_preview_deployment_not_success");
    expect(workflow).toContain("waiver_preview_url_not_approved");
    expect(workflow).toContain("actions/workflows/launch-validation.yml/runs");
    expect(workflow).toContain(".github/workflows/supabase-staging-migration-plan.yml");
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$RUNTIME_ARTIFACT_ID/zip" > runtime-artifact.zip');
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$MIGRATION_ARTIFACT_ID/zip" > migration-artifact.zip');
    expect(workflow).not.toContain("download-artifact@v");
    expect(workflow).toContain("promotion_request_id_mutable_alias");
    expect(workflow).toContain("preview_certification_contract_incompatibility");
    expect(workflow).toContain("previewRuntimeCertificationCompleted");
    expect(workflow).toContain("if: ${{ inputs.preview_certification_waiver == 'false' }}");
  });

  it("composes, exports, validates and uploads immutable final attestation", () => {
    expect(workflow).toContain("scripts/ci/staging-promotion-evidence.mjs");
    expect(workflow).toContain("runtime-artifact/operational-runtime-live-certification.json");
    expect(workflow).toContain("migration-artifact/supabase-staging-migration-plan.json");
    expect(workflow).toContain("actions/setup-node@v4");
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("scripts/ci/export-persisted-promotion-approval-evidence.ts");
    expect(workflow).toContain("npx --no-install tsx scripts/ci/export-persisted-promotion-approval-evidence.ts");
    expect(workflow).toContain("Export persisted promotion approvals");
    expect(workflow).not.toContain("npx --yes tsx");
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

    expect(workflow).toContain("waiver_preview_url_not_approved");
    expect(workflow).not.toContain("azure");
    expect(workflow).not.toContain("az containerapp update");
    expect(workflow).not.toContain("az containerapp revision");
    expect(workflow).not.toContain("azure/login");
    expect(workflow).not.toContain("docker push");
  });
});
