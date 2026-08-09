import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const EXPECTED_SOURCE_ENV = "staging";
const EXPECTED_TARGET_ENV = "production";
const EXPECTED_ACR = "aioscoreacr";
const EXPECTED_IMAGE = "aios-runtime";
const EXPECTED_RESOURCE_GROUP = "aios-core-rg";
const EXPECTED_CONTAINER_APP = "aios-runtime";
const DEPLOY_WORKFLOW_PATH = ".github/workflows/aios-runtime-AutoDeployTrigger-e27f8fb8-1f56-4d74-ab1a-8ab2f82f4791.yml";
const PROMOTION_WORKFLOW_PATH = ".github/workflows/production-promotion-attestation.yml";

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const POSITIVE_INT = /^[1-9][0-9]*$/;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertNoSensitiveKeys(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => assertNoSensitiveKeys(entry, `${path}[${idx}]`));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, next] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("password") ||
      normalized.includes("credential") ||
      normalized.includes("cookie") ||
      normalized.includes("database_url") ||
      normalized === "db_url"
    ) {
      fail(`sensitive_key_rejected:${path ? `${path}.` : ""}${key}`);
    }
    assertNoSensitiveKeys(next, path ? `${path}.${key}` : key);
  }
}

function assertNoSensitiveValues(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  const forbiddenPatterns = [
    /postgres:\/\//,
    /supabase.*service_role/,
    /bearer\s+[a-z0-9\-_.]+/,
    /ghp_[a-z0-9]+/,
    /xox[baprs]-[a-z0-9-]+/,
    /vercel[_-]?token/,
    /cookie=/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) fail("sensitive_value_rejected");
  }
}

function assertSha(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertPositiveIdentity(value, code) {
  if (typeof value !== "string" || !POSITIVE_INT.test(value)) fail(code);
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return value;
}

function containsMutableAlias(value) {
  const lowered = String(value).toLowerCase();
  return lowered.includes("latest") || lowered.includes("head") || lowered === "main";
}

function assertImmutableRef(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  if (containsMutableAlias(value)) fail(code);
  return value;
}

function assertWorkflowRef(value, expectedPath, runId, runAttempt, codePrefix) {
  const ref = assertImmutableRef(value, `${codePrefix}_workflow_ref_invalid`);
  if (ref.includes("http://") || ref.includes("https://")) fail(`${codePrefix}_workflow_ref_invalid`);

  const expectedPrefix = `${EXPECTED_REPOSITORY}/${expectedPath}@`;
  if (!ref.startsWith(expectedPrefix)) fail(`${codePrefix}_workflow_ref_path_mismatch`);

  const expectedSuffix = `#run:${runId}:attempt:${runAttempt}`;
  if (!ref.endsWith(expectedSuffix)) fail(`${codePrefix}_workflow_ref_binding_mismatch`);

  const atIndex = ref.indexOf("@");
  const hashIndex = ref.indexOf("#run:");
  if (atIndex < 0 || hashIndex < 0 || hashIndex <= atIndex + 1) fail(`${codePrefix}_workflow_ref_invalid`);

  const headSha = ref.slice(atIndex + 1, hashIndex);
  assertSha(headSha, `${codePrefix}_workflow_ref_head_sha_invalid`);
  return ref;
}

function buildDeploymentEvidenceId(material) {
  return `production-deployment-evidence:${createHash("sha256").update(material.join(":"), "utf8").digest("hex")}`;
}

export function validateProductionDeploymentProvenance(input, options = {}) {
  if (!isObject(input)) fail("input_invalid");

  assertNoSensitiveKeys(input);
  assertNoSensitiveValues(input);

  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (input.sourceEnvironment !== EXPECTED_SOURCE_ENV) fail("source_environment_mismatch");
  if (input.targetEnvironment !== EXPECTED_TARGET_ENV) fail("target_environment_mismatch");

  const targetSha = assertSha(input.targetSha, "target_sha_invalid");
  const expectedSha = assertSha(options.expectedSha ?? input.targetSha, "expected_sha_invalid");
  if (targetSha !== expectedSha) fail("target_sha_mismatch");

  const promotion = input.promotionAuthorization;
  if (!isObject(promotion)) fail("promotion_authorization_missing");

  const promotionArtifactIdNumeric = assertPositiveIdentity(promotion.promotionArtifactId, "promotion_artifact_id_invalid");
  const promotionArtifactId = `github-artifact:${promotionArtifactIdNumeric}`;
  const promotionRunId = assertPositiveIdentity(promotion.promotionWorkflowRunId, "promotion_run_id_invalid");
  const promotionRunAttempt = assertPositiveIdentity(promotion.promotionWorkflowRunAttempt, "promotion_run_attempt_invalid");
  const promotionArtifactName = assertImmutableRef(promotion.promotionArtifactName, "promotion_artifact_name_invalid");

  const expectedPromotionArtifactName = `promotion-attestation-${targetSha}-${promotionRunId}`;
  if (promotionArtifactName !== expectedPromotionArtifactName) fail("promotion_artifact_name_mismatch");

  const promotionWorkflowRef = assertWorkflowRef(
    promotion.promotionWorkflowRef,
    PROMOTION_WORKFLOW_PATH,
    promotionRunId,
    promotionRunAttempt,
    "promotion",
  );

  const guard = input.livePromotionGuard;
  if (!isObject(guard)) fail("live_guard_missing");
  if (guard.ok !== true) fail("live_guard_not_ok");
  if (guard.repository !== EXPECTED_REPOSITORY) fail("live_guard_repository_mismatch");
  if (guard.sourceEnvironment !== EXPECTED_SOURCE_ENV) fail("live_guard_source_environment_mismatch");
  if (guard.targetEnvironment !== EXPECTED_TARGET_ENV) fail("live_guard_target_environment_mismatch");
  if (guard.promotionAuthorized !== true) fail("live_guard_not_authorized");

  const guardEvidenceId = assertImmutableRef(guard.guardEvidenceId, "live_guard_evidence_id_invalid");
  const guardVerifiedAt = assertTimestamp(guard.verifiedAt, "live_guard_verified_at_invalid");
  const guardDeploymentTargetSha = assertSha(guard.deploymentTargetSha, "live_guard_target_sha_invalid");
  if (guardDeploymentTargetSha !== targetSha) fail("live_guard_target_sha_mismatch");

  const guardArtifactId = assertImmutableRef(guard.artifactId, "live_guard_artifact_id_invalid");
  if (guardArtifactId !== promotionArtifactId) fail("live_guard_artifact_id_mismatch");

  const guardRunId = assertPositiveIdentity(guard.workflowRunId, "live_guard_run_id_invalid");
  const guardRunAttempt = assertPositiveIdentity(String(guard.workflowRunAttempt), "live_guard_run_attempt_invalid");
  const guardArtifactName = assertImmutableRef(guard.artifactName, "live_guard_artifact_name_invalid");

  if (guardRunId !== promotionRunId) fail("live_guard_run_id_mismatch");
  if (guardRunAttempt !== promotionRunAttempt) fail("live_guard_run_attempt_mismatch");
  if (guardArtifactName !== promotionArtifactName) fail("live_guard_artifact_name_mismatch");

  const guardWorkflowRef = assertWorkflowRef(
    guard.workflowRef,
    PROMOTION_WORKFLOW_PATH,
    guardRunId,
    guardRunAttempt,
    "live_guard",
  );

  if (guardWorkflowRef !== promotionWorkflowRef) fail("live_guard_workflow_ref_mismatch");

  const deployment = input.deploymentWorkflow;
  if (!isObject(deployment)) fail("deployment_workflow_missing");
  const deploymentRunId = assertPositiveIdentity(deployment.runId, "deployment_run_id_invalid");
  const deploymentRunAttempt = assertPositiveIdentity(deployment.runAttempt, "deployment_run_attempt_invalid");
  assertWorkflowRef(deployment.workflowRef, DEPLOY_WORKFLOW_PATH, deploymentRunId, deploymentRunAttempt, "deployment");

  const image = input.containerImage;
  if (!isObject(image)) fail("container_image_missing");
  if (image.acrName !== EXPECTED_ACR) fail("acr_name_mismatch");
  if (image.imageName !== EXPECTED_IMAGE) fail("image_name_mismatch");
  if (image.imageTag !== targetSha) fail("image_tag_mismatch");
  if (typeof image.imageDigest !== "string" || !SHA256_DIGEST.test(image.imageDigest)) fail("image_digest_invalid");

  const azure = input.azureProductionTarget;
  if (!isObject(azure)) fail("azure_target_missing");
  if (azure.resourceGroup !== EXPECTED_RESOURCE_GROUP) fail("azure_resource_group_mismatch");
  if (azure.containerApp !== EXPECTED_CONTAINER_APP) fail("azure_container_app_mismatch");
  const deployedRevisionName = assertImmutableRef(azure.deployedRevisionName, "azure_revision_invalid");
  const deployedAt = assertTimestamp(azure.deployedAt, "azure_deployed_at_invalid");

  const deploymentEvidenceId = buildDeploymentEvidenceId([
    EXPECTED_REPOSITORY,
    targetSha,
    promotionArtifactId,
    promotionArtifactName,
    promotionRunId,
    promotionRunAttempt,
    promotionWorkflowRef,
    guardEvidenceId,
    guardVerifiedAt,
    guardArtifactId,
    guardRunId,
    guardRunAttempt,
    guardArtifactName,
    guardWorkflowRef,
    deploymentRunId,
    deploymentRunAttempt,
    deployment.workflowRef,
    EXPECTED_ACR,
    EXPECTED_IMAGE,
    image.imageTag,
    image.imageDigest,
    EXPECTED_RESOURCE_GROUP,
    EXPECTED_CONTAINER_APP,
    deployedRevisionName,
    deployedAt,
  ]);

  const output = {
    repository: EXPECTED_REPOSITORY,
    sourceEnvironment: EXPECTED_SOURCE_ENV,
    targetEnvironment: EXPECTED_TARGET_ENV,
    targetSha,
    promotionAuthorization: {
      promotionArtifactId: promotionArtifactIdNumeric,
      promotionArtifactName,
      promotionWorkflowRunId: promotionRunId,
      promotionWorkflowRunAttempt: promotionRunAttempt,
      promotionWorkflowRef,
    },
    livePromotionGuard: {
      ok: true,
      repository: EXPECTED_REPOSITORY,
      sourceEnvironment: EXPECTED_SOURCE_ENV,
      targetEnvironment: EXPECTED_TARGET_ENV,
      deploymentTargetSha: guardDeploymentTargetSha,
      promotionAuthorized: true,
      guardEvidenceId,
      verifiedAt: guardVerifiedAt,
      artifactId: guardArtifactId,
      workflowRunId: guardRunId,
      workflowRunAttempt: guardRunAttempt,
      artifactName: guardArtifactName,
      workflowRef: guardWorkflowRef,
    },
    deploymentWorkflow: {
      runId: deploymentRunId,
      runAttempt: deploymentRunAttempt,
      workflowRef: deployment.workflowRef,
    },
    containerImage: {
      acrName: EXPECTED_ACR,
      imageName: EXPECTED_IMAGE,
      imageTag: targetSha,
      imageDigest: image.imageDigest,
    },
    azureProductionTarget: {
      resourceGroup: EXPECTED_RESOURCE_GROUP,
      containerApp: EXPECTED_CONTAINER_APP,
      deployedRevisionName,
      deployedAt,
    },
    deploymentEvidenceId,
  };

  assertNoSensitiveKeys(output);
  assertNoSensitiveValues(output);

  return output;
}

function main() {
  const command = process.argv[2];
  if (command !== "validate") {
    throw new Error("usage: node scripts/ci/production-deployment-provenance.mjs validate <input-json> <expected-sha>");
  }

  const inputPath = process.argv[3];
  const expectedSha = process.argv[4];
  if (!inputPath || !expectedSha) {
    throw new Error("usage: node scripts/ci/production-deployment-provenance.mjs validate <input-json> <expected-sha>");
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    throw new Error("input_parse_failed");
  }

  const result = validateProductionDeploymentProvenance(payload, { expectedSha });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : String(error?.message ?? "production_deployment_provenance_invalid");
    console.error(code);
    process.exit(1);
  }
}
