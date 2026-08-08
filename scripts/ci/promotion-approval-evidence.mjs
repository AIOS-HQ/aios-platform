import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EXPECTED_REPOSITORY = "AIOS-HQ/aios-platform";
const SHA40 = /^[0-9a-f]{40}$/;

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

function assertNonEmpty(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  return value;
}

function assertSha(value, code) {
  if (typeof value !== "string" || !SHA40.test(value)) fail(code);
  return value;
}

function assertTimestamp(value, code) {
  const parsed = Date.parse(assertNonEmpty(value, code));
  if (!Number.isFinite(parsed)) fail(code);
  return value;
}

function assertImmutableRef(value, code) {
  const ref = assertNonEmpty(value, code);
  const lowered = ref.toLowerCase();
  if (lowered.includes("latest") || lowered.includes("head") || lowered === "main") fail(code);
  return ref;
}

function assertSubject(subject, expectedSha) {
  if (!isObject(subject)) fail("subject_missing");
  if (subject.repository !== EXPECTED_REPOSITORY) fail("repository_mismatch");
  if (subject.purpose !== "production_promotion") fail("purpose_mismatch");
  if (subject.sourceEnvironment !== "staging") fail("source_environment_mismatch");
  if (subject.targetEnvironment !== "production") fail("target_environment_mismatch");

  const targetSha = assertSha(subject.targetSha, "target_sha_invalid");
  if (targetSha !== expectedSha) fail("target_sha_mismatch");

  const promotionRequestId = assertImmutableRef(subject.promotionRequestId, "promotion_request_id_invalid");
  const runtimeEvidenceId = assertImmutableRef(subject.runtimeEvidenceId, "runtime_evidence_id_invalid");
  const runtimeArtifactId = assertImmutableRef(subject.runtimeArtifactId, "runtime_artifact_id_invalid");
  const migrationEvidenceId = assertImmutableRef(subject.migrationEvidenceId, "migration_evidence_id_invalid");
  const migrationArtifactId = assertImmutableRef(subject.migrationArtifactId, "migration_artifact_id_invalid");

  return {
    repository: EXPECTED_REPOSITORY,
    purpose: "production_promotion",
    targetSha,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    promotionRequestId,
    runtimeEvidenceId,
    runtimeArtifactId,
    migrationEvidenceId,
    migrationArtifactId,
  };
}

function assertFounderEvidence(founder, subject) {
  if (!isObject(founder)) fail("founder_missing");
  if (founder.purpose !== "production_promotion") fail("founder_purpose_mismatch");
  if (founder.authority !== "founder") fail("founder_authority_invalid");
  if (founder.decision !== "approved") fail("founder_decision_invalid");
  if (founder.actorType !== "founder") fail("founder_actor_type_invalid");

  const actorId = assertNonEmpty(founder.actorId, "founder_actor_id_missing");
  const evidenceId = assertImmutableRef(founder.evidenceId, "founder_evidence_id_invalid");
  const approvedAt = assertTimestamp(founder.approvedAt, "founder_approved_at_invalid");

  if (assertImmutableRef(founder.promotionRequestId, "founder_request_id_invalid") !== subject.promotionRequestId) {
    fail("founder_request_id_mismatch");
  }
  if (assertSha(founder.targetSha, "founder_target_sha_invalid") !== subject.targetSha) fail("founder_target_sha_mismatch");
  if (assertImmutableRef(founder.runtimeEvidenceId, "founder_runtime_evidence_id_invalid") !== subject.runtimeEvidenceId) {
    fail("founder_runtime_evidence_mismatch");
  }
  if (assertImmutableRef(founder.runtimeArtifactId, "founder_runtime_artifact_id_invalid") !== subject.runtimeArtifactId) {
    fail("founder_runtime_artifact_mismatch");
  }
  if (assertImmutableRef(founder.migrationEvidenceId, "founder_migration_evidence_id_invalid") !== subject.migrationEvidenceId) {
    fail("founder_migration_evidence_mismatch");
  }
  if (assertImmutableRef(founder.migrationArtifactId, "founder_migration_artifact_id_invalid") !== subject.migrationArtifactId) {
    fail("founder_migration_artifact_mismatch");
  }

  return {
    status: "approved",
    actorType: "founder",
    actorId,
    evidenceId,
    approvedAt,
  };
}

function assertHarmonyEvidence(harmony, subject) {
  if (!isObject(harmony)) fail("harmony_missing");
  if (harmony.purpose !== "production_promotion") fail("harmony_purpose_mismatch");
  if (harmony.authority !== "harmony") fail("harmony_authority_invalid");
  if (harmony.decision !== "approved") fail("harmony_decision_invalid");
  if (harmony.agentId !== "harmony") fail("harmony_agent_invalid");

  const evidenceId = assertImmutableRef(harmony.evidenceId, "harmony_evidence_id_invalid");
  const approvedAt = assertTimestamp(harmony.approvedAt, "harmony_approved_at_invalid");
  const governancePolicyVersion = assertImmutableRef(harmony.governancePolicyVersion, "harmony_policy_version_invalid");

  if (assertImmutableRef(harmony.promotionRequestId, "harmony_request_id_invalid") !== subject.promotionRequestId) {
    fail("harmony_request_id_mismatch");
  }
  if (assertSha(harmony.targetSha, "harmony_target_sha_invalid") !== subject.targetSha) fail("harmony_target_sha_mismatch");
  if (assertImmutableRef(harmony.runtimeEvidenceId, "harmony_runtime_evidence_id_invalid") !== subject.runtimeEvidenceId) {
    fail("harmony_runtime_evidence_mismatch");
  }
  if (assertImmutableRef(harmony.runtimeArtifactId, "harmony_runtime_artifact_id_invalid") !== subject.runtimeArtifactId) {
    fail("harmony_runtime_artifact_mismatch");
  }
  if (assertImmutableRef(harmony.migrationEvidenceId, "harmony_migration_evidence_id_invalid") !== subject.migrationEvidenceId) {
    fail("harmony_migration_evidence_mismatch");
  }
  if (assertImmutableRef(harmony.migrationArtifactId, "harmony_migration_artifact_id_invalid") !== subject.migrationArtifactId) {
    fail("harmony_migration_artifact_mismatch");
  }

  return {
    status: "approved",
    agentId: "harmony",
    evidenceId,
    approvedAt,
    governancePolicyVersion,
  };
}

function buildBundleId(subject, founderApproval, harmonyApproval) {
  const material = [
    subject.promotionRequestId,
    subject.targetSha,
    subject.runtimeEvidenceId,
    subject.runtimeArtifactId,
    subject.migrationEvidenceId,
    subject.migrationArtifactId,
    founderApproval.evidenceId,
    harmonyApproval.evidenceId,
    harmonyApproval.governancePolicyVersion,
  ].join(":");
  return `promotion-approval-bundle:${createHash("sha256").update(material).digest("hex")}`;
}

export function validatePromotionApprovalEvidence(input, options = {}) {
  if (!isObject(input)) fail("input_invalid");
  assertNoSensitiveKeys(input);
  assertNoSensitiveValues(input);

  const expectedSha = assertSha(options.expectedSha ?? input?.subject?.targetSha, "expected_sha_invalid");
  const subject = assertSubject(input.subject, expectedSha);

  const founderApproval = assertFounderEvidence(input.founderApproval, subject);
  const harmonyApproval = assertHarmonyEvidence(input.harmonyGovernanceApproval, subject);

  if (founderApproval.evidenceId === harmonyApproval.evidenceId) fail("approval_evidence_ids_must_differ");

  const bundleId = buildBundleId(subject, founderApproval, harmonyApproval);

  const output = {
    subject,
    founderApproval: {
      status: founderApproval.status,
      actorType: founderApproval.actorType,
      actorId: founderApproval.actorId,
      evidenceId: founderApproval.evidenceId,
      approvedAt: founderApproval.approvedAt,
    },
    harmonyGovernanceApproval: {
      status: harmonyApproval.status,
      agentId: harmonyApproval.agentId,
      evidenceId: harmonyApproval.evidenceId,
      approvedAt: harmonyApproval.approvedAt,
    },
    bundleId,
  };

  assertNoSensitiveKeys(output);
  assertNoSensitiveValues(output);
  return output;
}

function main() {
  const command = process.argv[2];
  if (command !== "validate") {
    throw new Error("usage: promotion-approval-evidence.mjs validate <input-json> <expected-sha>");
  }
  const inputPath = process.argv[3];
  const expectedSha = process.argv[4];
  if (!inputPath || !expectedSha) {
    throw new Error("usage: promotion-approval-evidence.mjs validate <input-json> <expected-sha>");
  }
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const output = validatePromotionApprovalEvidence(payload, { expectedSha });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : "promotion_approval_evidence_invalid";
    console.error(code);
    process.exit(1);
  }
}
