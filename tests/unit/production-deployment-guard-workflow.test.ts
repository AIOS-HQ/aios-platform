import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/aios-runtime-AutoDeployTrigger-e27f8fb8-1f56-4d74-ab1a-8ab2f82f4791.yml";
const workflow = readFileSync(workflowPath, "utf8");

function block(startMarker: string, endMarker: string) {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

const buildBlock = block("\n  build-and-deploy:\n", "\n  resolve-production-fqdn-certification-only:\n");

describe("production deployment guard workflow wiring", () => {
  it("preserves PR docker validation and removes automatic main-push production deploy", () => {
    expect(workflow).toContain("docker-pr-validation:");
    expect(workflow).toContain("if: github.event_name == 'pull_request'");
    expect(workflow).not.toContain("on:\n  push:");
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("requires dispatch target SHA and exact promotion artifact ID", () => {
    expect(workflow).toContain("target_sha:");
    expect(workflow).toContain("promotion_artifact_id:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("^[0-9a-f]{40}$");
    expect(workflow).toContain("promotion_artifact_id_invalid");
    expect(workflow).toContain("^[1-9][0-9]*$");
  });

  it("pins trusted current-main controls and constrains target SHA to main history", () => {
    expect(workflow).toContain("Checkout trusted current-main controls");
    expect(workflow).toContain("ref: main");
    expect(workflow).toContain("trusted_main_mismatch");
    expect(workflow).toContain("target_sha_not_in_main_history");
    expect(workflow).toContain("git merge-base --is-ancestor");
  });

  it("uses exact numeric artifact resolution/download and canonical producer provenance", () => {
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$PROMOTION_ARTIFACT_ID"');
    expect(workflow).toContain('gh api "/repos/$REPO/actions/artifacts/$PROMOTION_ARTIFACT_ID/zip" > promotion-artifact.zip');
    expect(workflow).toContain("promotion_artifact_expired");
    expect(workflow).toContain("promotion_source_run_not_success");
    expect(workflow).toContain("promotion_source_workflow_invalid");
    expect(workflow).toContain(".github/workflows/production-promotion-attestation.yml");
    expect(workflow).toContain("promotion_source_event_invalid");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("promotion_source_run_attempt_invalid");
    expect(workflow).toContain("promotion_source_head_sha_invalid");
    expect(workflow).toContain("promotion-attestation-${TARGET_SHA}-${source_run_id}");
  });

  it("executes M5C-1 live promotion guard prior to all production side effects", () => {
    expect(workflow).toContain("scripts/ci/live-promotion-guard.mjs validate live-promotion-guard-input.json");

    const guardIndex = workflow.indexOf("scripts/ci/live-promotion-guard.mjs validate live-promotion-guard-input.json");
    const azureLoginIndex = workflow.indexOf("- name: Azure Login");
    const dockerPushIndex = workflow.indexOf("docker push \"$REGISTRY_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG\"");
    const registrySetIndex = workflow.indexOf("az containerapp registry set");
    const appUpdateIndex = workflow.indexOf("az containerapp update");
    const ingressUpdateIndex = workflow.indexOf("az containerapp ingress update");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(azureLoginIndex).toBeGreaterThan(guardIndex);
    expect(dockerPushIndex).toBeGreaterThan(guardIndex);
    expect(registrySetIndex).toBeGreaterThan(guardIndex);
    expect(appUpdateIndex).toBeGreaterThan(guardIndex);
    expect(ingressUpdateIndex).toBeGreaterThan(guardIndex);
  });

  it("deploys exact target SHA and introduces no Supabase secrets", () => {
    expect(workflow).toContain("Checkout exact deployment target SHA");
    expect(workflow).toContain("deployment_checkout_sha_mismatch");
    expect(workflow).toContain("IMAGE_TAG: ${{ inputs.target_sha }}");

    expect(buildBlock).not.toContain("SUPABASE_URL");
    expect(buildBlock).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain('SUPABASE_URL: ${{ secrets.SUPABASE_URL }}');
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
