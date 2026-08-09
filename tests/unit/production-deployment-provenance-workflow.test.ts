import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/aios-runtime-AutoDeployTrigger-e27f8fb8-1f56-4d74-ab1a-8ab2f82f4791.yml";
const workflow = readFileSync(workflowPath, "utf8");

describe("production deployment provenance producer wiring", () => {
  it("persists actual M5C-1 stdout and consumes it unchanged later", () => {
    expect(workflow).toContain('node scripts/ci/live-promotion-guard.mjs validate live-promotion-guard-input.json "$TARGET_SHA" > "$RUNNER_TEMP/live-promotion-guard-output.json"');
    expect(workflow).toContain('const livePromotionGuard = JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/live-promotion-guard-output.json`, "utf8"));');
    expect(workflow).toContain("livePromotionGuard,");
  });

  it("copies trusted M5D contract before exact target checkout", () => {
    const copyIndex = workflow.indexOf("cp scripts/ci/production-deployment-provenance.mjs \"$RUNNER_TEMP/production-deployment-provenance.mjs\"");
    const checkoutTargetIndex = workflow.indexOf("- name: Checkout exact deployment target SHA");
    expect(copyIndex).toBeGreaterThan(-1);
    expect(checkoutTargetIndex).toBeGreaterThan(copyIndex);
  });

  it("keeps authorization ordering with azure side effects after M5C-1 guard", () => {
    const guardIndex = workflow.indexOf("live-promotion-guard.mjs validate live-promotion-guard-input.json");
    const azureLoginIndex = workflow.indexOf("- name: Azure Login");
    const dockerPushIndex = workflow.indexOf("docker push \"$REGISTRY_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG\"");
    const appMutationsIndex = workflow.indexOf("az containerapp update");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(azureLoginIndex).toBeGreaterThan(guardIndex);
    expect(dockerPushIndex).toBeGreaterThan(guardIndex);
    expect(appMutationsIndex).toBeGreaterThan(guardIndex);
  });

  it("captures immutable digest after docker push and preserves exact target sha tag", () => {
    const pushIndex = workflow.indexOf("docker push \"$REGISTRY_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG\"");
    const digestStepIndex = workflow.indexOf("- name: Resolve immutable pushed image digest from ACR");

    expect(workflow).toContain("IMAGE_TAG: ${{ inputs.target_sha }}");
    expect(workflow).toContain("show-manifests");
    expect(workflow).toContain("contains(tags, '$TARGET_SHA')");
    expect(workflow).toContain("^sha256:[0-9a-f]{64}$");
    expect(digestStepIndex).toBeGreaterThan(pushIndex);
  });

  it("resolves deployed revision after deployment and binds createdTime + image", () => {
    const deployIndex = workflow.indexOf("az containerapp update");
    const revisionIndex = workflow.indexOf("- name: Resolve deployed Azure revision identity");
    expect(revisionIndex).toBeGreaterThan(deployIndex);

    expect(workflow).toContain("az containerapp revision list");
    expect(workflow).toContain("az containerapp revision show");
    expect(workflow).toContain(".properties.createdTime");
    expect(workflow).toContain("deployed_at_missing");
    expect(workflow).toContain("deployed_revision_image_mismatch");
    expect(workflow).toContain("$REGISTRY_LOGIN_SERVER/$IMAGE_NAME:$TARGET_SHA");
  });

  it("records immutable deployment workflow identity and validates canonical M5D contract", () => {
    expect(workflow).toContain("#run:${process.env.GITHUB_RUN_ID}:attempt:${process.env.GITHUB_RUN_ATTEMPT}");
    expect(workflow).toContain("$RUNNER_TEMP/production-deployment-provenance.mjs");
    expect(workflow).toContain("production-deployment-provenance-input.json");
    expect(workflow).toContain("production-deployment-provenance.json");
  });

  it("uploads immutable provenance artifact after validation and keeps guardrails", () => {
    const validateIndex = workflow.indexOf("- name: Validate canonical production deployment provenance");
    const uploadIndex = workflow.indexOf("- name: Upload immutable production deployment provenance artifact");
    expect(uploadIndex).toBeGreaterThan(validateIndex);

    expect(workflow).toContain("production-deployment-provenance-${{ inputs.target_sha }}-${{ github.run_id }}");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).not.toContain("SUPABASE_URL");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("on:\n  push:");
    expect(workflow).toContain("docker-pr-validation:");
  });
});
