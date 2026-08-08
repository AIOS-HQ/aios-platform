import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validatePromotionAttestation } from "./promotion-attestation-contract.mjs";

const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const SHA40 = /^[0-9a-f]{40}$/;
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

function assertPositiveAttempt(value, code) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) fail(code);
  return numberValue;
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

function assertArtifactName(value, expectedSha, runId) {
  if (typeof value !== "string" || value.trim() === "") fail("artifact_name_invalid");
  if (containsMutableAlias(value)) fail("artifact_name_mutable_alias");
  if (!value.includes("promotion-attestation")) fail("artifact_name_family_mismatch");
  if (!value.includes(expectedSha)) fail("artifact_name_sha_missing");
  if (!value.includes(runId)) fail("artifact_name_run_id_missing");
  return value;
}

function assertWorkflowRef(value) {
  if (typeof value !== "string" || value.trim() === "") fail("workflow_ref_invalid");
  const lowered = value.toLowerCase();
  if (lowered.endsWith("@main") || lowered.endsWith("@head") || lowered.endsWith("@latest")) {
    fail("workflow_ref_mutable_selector");
  }
  return value;
}

function buildGuardEvidenceId(deploymentTargetSha, metadata, attestation) {
  const material = [
    deploymentTargetSha,
    metadata.artifactId,
    metadata.workflowRunId,
    String(metadata.workflowRunAttempt),
    attestation.runtimeCertification.evidenceId,
    attestation.migrationPlanCertification.evidenceId,
    attestation.founderApproval.evidenceId,
    attestation.harmonyGovernanceApproval.evidenceId,
  ].join(":");
  return `guard:${createHash("sha256").update(material).digest("hex")}`;
}

export function validateLivePromotionGuard(input, options = {}) {
  if (!isObject(input)) fail("guard_input_invalid");
  assertNoSensitiveKeys(input);
  assertNoSensitiveValues(input);

  if (input.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");

  const deploymentTargetSha = assertSha(input.deploymentTargetSha, "deployment_target_sha_invalid");
  if (options.expectedSha) {
    const expectedSha = assertSha(options.expectedSha, "expected_sha_invalid");
    if (deploymentTargetSha !== expectedSha) fail("deployment_target_sha_mismatch");
  }

  const attestation = input.promotionAttestation;
  if (!isObject(attestation)) fail("promotion_attestation_missing");
  validatePromotionAttestation(attestation, { expectedSha: deploymentTargetSha });

  const metadata = input.promotionArtifact;
  if (!isObject(metadata)) fail("promotion_artifact_metadata_missing");
  const artifactId = assertPositiveIdentity(String(metadata.artifactId ?? ""), "artifact_id_invalid");
  const workflowRunId = assertPositiveIdentity(String(metadata.workflowRunId ?? ""), "workflow_run_id_invalid");
  const workflowRunAttempt = assertPositiveAttempt(metadata.workflowRunAttempt, "workflow_run_attempt_invalid");
  const attestedSha = assertSha(metadata.attestedSha, "artifact_attested_sha_invalid");
  if (attestedSha !== deploymentTargetSha) fail("artifact_attested_sha_mismatch");
  const artifactName = assertArtifactName(metadata.artifactName, deploymentTargetSha, workflowRunId);
  const workflowRef = assertWorkflowRef(metadata.workflowRef);

  const verifiedAt = assertTimestamp(new Date().toISOString(), "guard_verified_at_invalid");
  const guardEvidenceId = buildGuardEvidenceId(deploymentTargetSha, {
    artifactId,
    workflowRunId,
    workflowRunAttempt,
  }, attestation);

  const output = {
    ok: true,
    repository: EXPECTED_REPOSITORY,
    deploymentTargetSha,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    promotionAuthorized: true,
    artifactId: `github-artifact:${artifactId}`,
    workflowRunId,
    workflowRunAttempt,
    artifactName,
    workflowRef,
    guardEvidenceId,
    verifiedAt,
  };

  assertNoSensitiveKeys(output);
  assertNoSensitiveValues(output);
  return output;
}

function main() {
  const command = process.argv[2];
  if (command !== "validate") {
    throw new Error("usage: live-promotion-guard.mjs validate <input-json> <expected-sha>");
  }
  const inputPath = process.argv[3];
  const expectedSha = process.argv[4];
  if (!inputPath || !expectedSha) {
    throw new Error("usage: live-promotion-guard.mjs validate <input-json> <expected-sha>");
  }
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const output = validateLivePromotionGuard(payload, { expectedSha });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : "live_promotion_guard_failed";
    console.error(code);
    process.exit(1);
  }
}
