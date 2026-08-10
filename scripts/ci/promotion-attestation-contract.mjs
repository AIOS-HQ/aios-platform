import { readFileSync } from "node:fs";

const EXPECTED_REPO = "AIOS-HQ/aios-platform";
const EXPECTED_SOURCE_ENV = "staging";
const EXPECTED_TARGET_ENV = "production";
const SHA40 = /^[0-9a-f]{40}$/;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseTimestampOrFail(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
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
    if (pattern.test(serialized)) {
      fail("sensitive_value_rejected");
    }
  }
}

function assertExactSha(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertImmutableEvidenceRef(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  if (value.includes("latest") || value.includes("main") || value.includes("HEAD")) {
    fail(code);
  }
  return value;
}

export function validatePromotionAttestation(attestation, options = {}) {
  if (!isObject(attestation)) fail("attestation_not_object");

  assertNoSensitiveKeys(attestation);
  assertNoSensitiveValues(attestation);

  if (attestation.repository !== EXPECTED_REPO) fail("repository_mismatch");
  if (attestation.sourceEnvironment !== EXPECTED_SOURCE_ENV) fail("source_environment_mismatch");
  if (attestation.targetEnvironment !== EXPECTED_TARGET_ENV) fail("target_environment_mismatch");

  const targetSha = assertExactSha(attestation.targetSha, "target_sha_invalid");
  if (options.expectedSha && targetSha !== options.expectedSha) fail("target_sha_mismatch");

  const runtime = attestation.runtimeCertification;
  if (!isObject(runtime)) fail("runtime_certification_missing");
  if (runtime.status !== "passed") fail("runtime_certification_failed");
  if (assertExactSha(runtime.targetSha, "runtime_target_sha_invalid") !== targetSha) fail("runtime_target_sha_mismatch");
  assertImmutableEvidenceRef(runtime.evidenceId, "runtime_evidence_invalid");
  assertImmutableEvidenceRef(runtime.artifactId, "runtime_artifact_invalid");

  const migration = attestation.migrationPlanCertification;
  if (!isObject(migration)) fail("migration_plan_certification_missing");
  if (migration.status !== "passed") fail("migration_plan_certification_failed");
  if (assertExactSha(migration.targetSha, "migration_target_sha_invalid") !== targetSha) fail("migration_target_sha_mismatch");
  assertImmutableEvidenceRef(migration.evidenceId, "migration_evidence_invalid");
  assertImmutableEvidenceRef(migration.artifactId, "migration_artifact_invalid");

  const founder = attestation.founderApproval;
  if (!isObject(founder)) fail("founder_approval_missing");
  if (founder.status !== "approved") fail("founder_approval_missing");
  if (founder.actorType !== "founder") fail("founder_actor_invalid");
  if (typeof founder.actorId !== "string" || founder.actorId.trim() === "") fail("founder_actor_missing");
  assertImmutableEvidenceRef(founder.evidenceId, "founder_evidence_invalid");

  const governance = attestation.harmonyGovernanceApproval;
  if (!isObject(governance)) fail("governance_approval_missing");
  if (governance.status !== "approved") fail("governance_approval_missing");
  if (governance.agentId !== "harmony") fail("governance_agent_invalid");
  assertImmutableEvidenceRef(governance.evidenceId, "governance_evidence_invalid");

  const issuedAt = parseTimestampOrFail(attestation.issuedAt, "issued_at_invalid");
  const verifiedAt = parseTimestampOrFail(attestation.verifiedAt, "verified_at_invalid");
  parseTimestampOrFail(runtime.verifiedAt, "runtime_verified_at_invalid");
  parseTimestampOrFail(migration.verifiedAt, "migration_verified_at_invalid");
  parseTimestampOrFail(founder.approvedAt, "founder_approved_at_invalid");
  parseTimestampOrFail(governance.approvedAt, "governance_approved_at_invalid");
  if (verifiedAt < issuedAt) fail("verified_before_issued");

  return {
    ok: true,
    targetSha,
    repository: EXPECTED_REPO,
    sourceEnvironment: EXPECTED_SOURCE_ENV,
    targetEnvironment: EXPECTED_TARGET_ENV,
  };
}

function main(argv) {
  const [command, filePath, expectedSha] = argv.slice(2);
  if (command !== "validate") {
    console.error("usage: node scripts/ci/promotion-attestation-contract.mjs validate <path> [expectedSha]");
    process.exit(64);
  }

  if (!filePath) {
    console.error("attestation_path_required");
    process.exit(64);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    console.error("attestation_parse_failed");
    process.exit(65);
  }

  try {
    const result = validatePromotionAttestation(payload, { expectedSha });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.code || String(error?.message || error));
    process.exit(66);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv);
}
