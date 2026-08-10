import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const EXPECTED_ENVIRONMENT = "production";
const REQUIRED_COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
];

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DEPLOYMENT_EVIDENCE_ID = /^production-deployment-evidence:[0-9a-f]{64}$/;

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
      normalized.includes("authorization") ||
      normalized.includes("database_url") ||
      normalized.includes("connection_string") ||
      normalized === "db_url" ||
      normalized.includes("profile")
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
    /mysql:\/\//,
    /mongodb(\+srv)?:\/\//,
    /supabase.*service_role/,
    /bearer\s+[a-z0-9\-_.]+/,
    /ghp_[a-z0-9]+/,
    /xox[baprs]-[a-z0-9-]+/,
    /vercel[_-]?token/,
    /cookie=/,
    /authorization:/,
    /api[_-]?key/,
    /service[_-]?role[_-]?key/,
  ];
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) fail("sensitive_value_rejected");
  }
}

function assertSha(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return { value, parsed };
}

function assertNonEmptyImmutable(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  const lowered = value.toLowerCase();
  if (lowered.includes("latest") || lowered.includes("head") || lowered === "main") fail(code);
  return value;
}

function assertComponentEntry(entry, expectedConditionId) {
  if (!isObject(entry)) fail("runtime_component_invalid");
  const component = assertNonEmptyImmutable(entry.component, "runtime_component_invalid");
  if (entry.status !== "healthy") fail("runtime_component_not_healthy");
  if (entry.evidenceType !== "live_runtime_proof" && entry.evidenceType !== "authenticated_runtime_proof") {
    fail("runtime_component_evidence_type_invalid");
  }
  if (!isObject(entry.details) || entry.details.liveProbeAttempted !== true) fail("runtime_probe_not_attempted");
  if (entry.runtimeConditionId !== expectedConditionId) fail("runtime_condition_id_mismatch");
  assertNonEmptyImmutable(entry.latencyBucket, "runtime_latency_bucket_missing");

  return {
    component,
    status: "healthy",
    evidenceType: entry.evidenceType,
    latencyBucket: entry.latencyBucket,
    runtimeConditionId: entry.runtimeConditionId,
  };
}

function buildPostLiveEvidenceId(material) {
  return `production-post-live-evidence:${createHash("sha256").update(material.join("|"), "utf8").digest("hex")}`;
}

export function validateProductionPostLiveEvidence(input, options = {}) {
  if (!isObject(input)) fail("input_invalid");

  assertNoSensitiveKeys(input);
  assertNoSensitiveValues(input);

  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (input.environment !== EXPECTED_ENVIRONMENT) fail("environment_mismatch");

  const targetSha = assertSha(input.targetSha, "target_sha_invalid");
  const expectedSha = assertSha(options.expectedSha ?? input.targetSha, "expected_sha_invalid");
  if (targetSha !== expectedSha) fail("target_sha_mismatch");

  const deployment = input.productionDeployment;
  if (!isObject(deployment)) fail("production_deployment_missing");

  const deploymentEvidenceId = assertNonEmptyImmutable(deployment.deploymentEvidenceId, "deployment_evidence_id_invalid");
  if (!DEPLOYMENT_EVIDENCE_ID.test(deploymentEvidenceId)) fail("deployment_evidence_id_invalid");

  if (options.expectedDeploymentEvidenceId && deploymentEvidenceId !== options.expectedDeploymentEvidenceId) {
    fail("deployment_evidence_id_mismatch");
  }

  const deploymentTargetSha = assertSha(deployment.targetSha, "deployment_target_sha_invalid");
  if (deploymentTargetSha !== targetSha) fail("deployment_target_sha_mismatch");

  if (deployment.imageTag !== targetSha) fail("deployment_image_tag_mismatch");
  if (typeof deployment.imageDigest !== "string" || !SHA256_DIGEST.test(deployment.imageDigest)) fail("deployment_image_digest_invalid");

  const deployedRevisionName = assertNonEmptyImmutable(deployment.deployedRevisionName, "deployment_revision_invalid");
  const deployedAt = assertTimestamp(deployment.deployedAt, "deployment_deployed_at_invalid");

  const authRuntime = input.authenticatedRuntime;
  if (!isObject(authRuntime)) fail("authenticated_runtime_missing");
  if (authRuntime.authenticatedSession !== true) fail("authenticated_session_required");
  if (authRuntime.founderAuthorized !== true) fail("founder_authorization_required");
  if (authRuntime.originMatched !== true) fail("origin_match_required");

  const summary = input.operationalRuntimeSummary;
  if (!isObject(summary)) fail("runtime_summary_missing");
  if (summary.componentCount !== 6) fail("runtime_component_count_invalid");
  if (summary.healthy !== 6) fail("runtime_healthy_count_invalid");
  if (summary.degraded !== 0) fail("runtime_degraded_count_invalid");
  if (summary.blocked !== 0) fail("runtime_blocked_count_invalid");
  if (summary.unavailable !== 0) fail("runtime_unavailable_count_invalid");
  if (summary.unknown !== 0) fail("runtime_unknown_count_invalid");

  if (!isObject(summary.runtimeCondition)) fail("runtime_condition_missing");
  const runtimeConditionId = assertNonEmptyImmutable(summary.runtimeCondition.conditionId, "runtime_condition_id_invalid");
  if (!HEX64.test(runtimeConditionId)) fail("runtime_condition_id_invalid");

  const runtimeOutcomeId = assertNonEmptyImmutable(summary.outcomeId, "runtime_outcome_id_invalid");
  if (!HEX64.test(runtimeOutcomeId)) fail("runtime_outcome_id_invalid");

  if (!Array.isArray(input.operationalRuntimeFoundation)) fail("runtime_foundation_missing");
  if (input.operationalRuntimeFoundation.length !== 6) fail("runtime_foundation_count_invalid");

  const entries = input.operationalRuntimeFoundation.map((entry) => assertComponentEntry(entry, runtimeConditionId));
  const components = entries.map((entry) => entry.component);
  const uniqueComponents = new Set(components);
  if (uniqueComponents.size !== 6) fail("runtime_component_duplicate");

  for (const required of REQUIRED_COMPONENTS) {
    if (!uniqueComponents.has(required)) fail("runtime_component_missing");
  }

  const verifiedAt = assertTimestamp(input.verifiedAt, "verified_at_invalid");
  if (verifiedAt.parsed < deployedAt.parsed) fail("verified_before_deployed");

  const sortedEntries = [...entries].sort((a, b) => a.component.localeCompare(b.component));

  const postLiveEvidenceId = buildPostLiveEvidenceId([
    EXPECTED_REPOSITORY,
    targetSha,
    deploymentEvidenceId,
    deployment.imageDigest,
    deployedRevisionName,
    deployedAt.value,
    runtimeConditionId,
    runtimeOutcomeId,
    ...sortedEntries.flatMap((entry) => [entry.component, entry.status, entry.evidenceType, entry.latencyBucket]),
    verifiedAt.value,
  ]);

  const output = {
    repository: EXPECTED_REPOSITORY,
    environment: EXPECTED_ENVIRONMENT,
    targetSha,
    productionDeployment: {
      deploymentEvidenceId,
      targetSha,
      imageDigest: deployment.imageDigest,
      imageTag: targetSha,
      deployedRevisionName,
      deployedAt: deployedAt.value,
    },
    authenticatedRuntime: {
      authenticatedSession: true,
      founderAuthorized: true,
      originMatched: true,
    },
    operationalRuntimeSummary: {
      componentCount: 6,
      healthy: 6,
      degraded: 0,
      blocked: 0,
      unavailable: 0,
      unknown: 0,
      runtimeCondition: {
        conditionId: runtimeConditionId,
      },
      outcomeId: runtimeOutcomeId,
    },
    operationalRuntimeFoundation: sortedEntries,
    verifiedAt: verifiedAt.value,
    postLiveEvidenceId,
  };

  assertNoSensitiveKeys(output);
  assertNoSensitiveValues(output);

  return output;
}

function main() {
  const command = process.argv[2];
  if (command !== "validate") {
    throw new Error("usage: node scripts/ci/production-post-live-evidence.mjs validate <input-json> <expected-sha> <expected-deployment-evidence-id>");
  }

  const inputPath = process.argv[3];
  const expectedSha = process.argv[4];
  const expectedDeploymentEvidenceId = process.argv[5];

  if (!inputPath || !expectedSha || !expectedDeploymentEvidenceId) {
    throw new Error("usage: node scripts/ci/production-post-live-evidence.mjs validate <input-json> <expected-sha> <expected-deployment-evidence-id>");
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    throw new Error("input_parse_failed");
  }

  const output = validateProductionPostLiveEvidence(payload, {
    expectedSha,
    expectedDeploymentEvidenceId,
  });

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : String(error?.message ?? "production_post_live_evidence_invalid");
    console.error(code);
    process.exit(1);
  }
}
