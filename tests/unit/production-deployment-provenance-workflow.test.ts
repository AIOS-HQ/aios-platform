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
const resolveFqdnCertOnlyBlock = block("\n  resolve-production-fqdn-certification-only:\n", "\n  post-live-certification:\n");
const postLiveCertificationBlock = workflow.slice(workflow.indexOf("\n  post-live-certification:\n"));

describe("production deployment and post-live certification workflow wiring", () => {
  it("preserves governed deployment guardrails on the deployment job", () => {
    expect(buildBlock).toContain("inputs.deployment_provenance_artifact_id == ''");
    expect(buildBlock).toContain("- name: Validate immutable workflow_dispatch inputs");
    expect(buildBlock).toContain("- name: Resolve promotion artifact by exact numeric ID and verify canonical provenance");
    expect(buildBlock).toContain('node scripts/ci/live-promotion-guard.mjs validate live-promotion-guard-input.json "$TARGET_SHA" > "$RUNNER_TEMP/live-promotion-guard-output.json"');
    expect(buildBlock).toContain("- name: Azure Login");
    expect(buildBlock).toContain('docker push "$REGISTRY_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG"');
    expect(buildBlock).toContain("az containerapp update");
    expect(buildBlock).toContain("- name: Validate canonical production deployment provenance");
    expect(buildBlock).toContain("- name: Upload immutable production deployment provenance artifact");
    expect(buildBlock).not.toContain("environment:\n      name: production");
  });

  it("keeps trusted M5D contract copy before exact target checkout in deployment job", () => {
    const copyIndex = buildBlock.indexOf('cp scripts/ci/production-deployment-provenance.mjs "$RUNNER_TEMP/production-deployment-provenance.mjs"');
    const checkoutTargetIndex = buildBlock.indexOf("- name: Checkout exact deployment target SHA");
    expect(copyIndex).toBeGreaterThan(-1);
    expect(checkoutTargetIndex).toBeGreaterThan(copyIndex);
  });

  it("resolves production fqdn in deployment outputs and supports certification-only input path", () => {
    expect(buildBlock).toContain("outputs:");
    expect(buildBlock).toContain("deployment_provenance_artifact_id");
    expect(buildBlock).toContain("production_fqdn");
    expect(buildBlock).toContain('echo "production_fqdn=$production_fqdn" >> "$GITHUB_OUTPUT"');

    expect(workflow).toContain("deployment_provenance_artifact_id:");
    expect(resolveFqdnCertOnlyBlock).toContain("inputs.deployment_provenance_artifact_id != ''");
    expect(postLiveCertificationBlock).toContain("DEPLOYMENT_PROVENANCE_ARTIFACT_ID_INPUT");
    expect(postLiveCertificationBlock).toContain("DEPLOYMENT_JOB_PROVENANCE_ARTIFACT_ID");
    expect(postLiveCertificationBlock).toContain("CERT_ONLY_PRODUCTION_FQDN");
  });

  it("uses read-only azure path for certification-only fqdn resolution", () => {
    expect(resolveFqdnCertOnlyBlock).toContain("- name: Azure Login (read-only production target resolution)");
    expect(resolveFqdnCertOnlyBlock).toContain("az containerapp show");
    expect(resolveFqdnCertOnlyBlock).toContain('properties.configuration.ingress.fqdn');
    expect(resolveFqdnCertOnlyBlock).not.toContain("az containerapp update");
    expect(resolveFqdnCertOnlyBlock).not.toContain("az containerapp ingress update");
    expect(resolveFqdnCertOnlyBlock).not.toContain("docker push");
  });

  it("binds post-live certification job to production environment and keeps secrets environment-scoped", () => {
    expect(postLiveCertificationBlock).toContain("environment:\n      name: production");
    expect(postLiveCertificationBlock).toContain('AIOS_PRODUCTION_CERT_FOUNDER_EMAIL: ${{ secrets.AIOS_PRODUCTION_CERT_FOUNDER_EMAIL }}');
    expect(postLiveCertificationBlock).toContain('AIOS_PRODUCTION_CERT_FOUNDER_PASSWORD: ${{ secrets.AIOS_PRODUCTION_CERT_FOUNDER_PASSWORD }}');
    expect(postLiveCertificationBlock).toContain("- name: Execute authenticated production post-live probe");
  });

  it("keeps post-live certification non-deploying and without azure login", () => {
    expect(postLiveCertificationBlock).not.toContain("azure/login");
    expect(postLiveCertificationBlock).not.toContain("az containerapp update");
    expect(postLiveCertificationBlock).not.toContain("az containerapp ingress update");
    expect(postLiveCertificationBlock).not.toContain("docker push");
  });

  it("preserves trusted M5E controls and verifies hash integrity in certification job", () => {
    const preserveIndex = postLiveCertificationBlock.indexOf("- name: Preserve trusted production post-live certification controls");
    const verifyHashIndex = postLiveCertificationBlock.indexOf("- name: Verify trusted production post-live certification control hashes");
    const probeIndex = postLiveCertificationBlock.indexOf("- name: Execute authenticated production post-live probe");

    expect(preserveIndex).toBeGreaterThan(-1);
    expect(verifyHashIndex).toBeGreaterThan(preserveIndex);
    expect(probeIndex).toBeGreaterThan(verifyHashIndex);

    expect(postLiveCertificationBlock).toContain('cp scripts/ci/production-post-live-probe.mjs "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-probe.mjs"');
    expect(postLiveCertificationBlock).toContain('cp scripts/ci/production-post-live-evidence.mjs "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-evidence.mjs"');
    expect(postLiveCertificationBlock).toContain('cp package-lock.json "$TRUSTED_CERT_DIR/package-lock.json"');
    expect(postLiveCertificationBlock).toContain('sha256sum "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-probe.mjs" > "$TRUSTED_CERT_DIR/production-post-live-probe.mjs.sha256"');
    expect(postLiveCertificationBlock).toContain('sha256sum "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-evidence.mjs" > "$TRUSTED_CERT_DIR/production-post-live-evidence.mjs.sha256"');
    expect(postLiveCertificationBlock).toContain('sha256sum "$TRUSTED_CERT_DIR/package-lock.json" > "$TRUSTED_CERT_DIR/package-lock.json.sha256"');
    expect(postLiveCertificationBlock).toContain('sha256sum -c "$TRUSTED_CERT_DIR/production-post-live-probe.mjs.sha256"');
    expect(postLiveCertificationBlock).toContain('sha256sum -c "$TRUSTED_CERT_DIR/production-post-live-evidence.mjs.sha256"');
    expect(postLiveCertificationBlock).toContain('sha256sum -c "$TRUSTED_CERT_DIR/package-lock.json.sha256"');
  });

  it("fails closed on certification-only provenance contract validation", () => {
    expect(postLiveCertificationBlock).toContain("deployment_provenance_artifact_id_unresolved");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_artifact_name_invalid");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_target_sha_mismatch");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_promotion_artifact_mismatch");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_live_guard_unauthorized");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_workflow_ref_invalid");
    expect(postLiveCertificationBlock).toContain("deployment_provenance_evidence_id_invalid");
  });

  it("keeps immutable M5E evidence generation and six-component fail-closed runtime proof", () => {
    expect(postLiveCertificationBlock).toContain('node "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-probe.mjs" probe');
    expect(postLiveCertificationBlock).toContain("production-post-live-probe-safe.json");
    expect(postLiveCertificationBlock).toContain('- name: Build M5E-1 production post-live evidence input');
    expect(postLiveCertificationBlock).toContain('const deploymentProvenance = JSON.parse(readFileSync("production-deployment-provenance.json", "utf8"));');
    expect(postLiveCertificationBlock).toContain('operationalRuntimeSummary: postLiveProbe.operationalRuntimeSummary');
    expect(postLiveCertificationBlock).toContain('operationalRuntimeFoundation: postLiveProbe.operationalRuntimeFoundation');
    expect(postLiveCertificationBlock).toContain('node "$TRUSTED_CERT_DIR/scripts/ci/production-post-live-evidence.mjs" validate');
    expect(postLiveCertificationBlock).toContain('production-post-live-evidence-${{ inputs.target_sha }}-${{ github.run_id }}');
  });

  it("keeps workflow guardrails and avoids unrelated secrets", () => {
    expect(workflow).not.toContain("on:\n  push:");
    expect(workflow).toContain("docker-pr-validation:");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("inputs.production_fqdn");
    expect(workflow).not.toContain('node scripts/ci/production-post-live-probe.mjs probe');
    expect(workflow).not.toContain('node scripts/ci/production-post-live-evidence.mjs validate');
  });
});
