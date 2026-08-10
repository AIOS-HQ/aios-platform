import { readFileSync, writeFileSync } from "node:fs";
import { validatePromotionApprovalEvidence } from "./promotion-approval-evidence.mjs";
import { validatePromotionAttestation } from "./promotion-attestation-contract.mjs";

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertNonEmptyString(value, code) {
  if (typeof value !== "string" || value.trim() === "") fail(code);
  return value;
}

function assertContractInput(value) {
  if (!isObject(value)) fail("input_invalid");
  if (!isObject(value.stagingPromotionEvidence)) fail("staging_evidence_missing");
  if (!isObject(value.promotionApprovalEvidence)) fail("approval_evidence_missing");
  const expectedTargetSha = assertNonEmptyString(value.expectedTargetSha, "expected_target_sha_missing");
  return {
    stagingPromotionEvidence: value.stagingPromotionEvidence,
    promotionApprovalEvidence: value.promotionApprovalEvidence,
    expectedTargetSha,
  };
}

function assertSubjectBinding(staging, approval) {
  if (staging.repository !== approval.subject.repository) fail("repository_mismatch");
  if (staging.targetSha !== approval.subject.targetSha) fail("target_sha_mismatch");
  if (staging.runtimeCertification.evidenceId !== approval.subject.runtimeEvidenceId) fail("runtime_evidence_id_mismatch");
  if (staging.runtimeCertification.artifactId !== approval.subject.runtimeArtifactId) fail("runtime_artifact_id_mismatch");
  if (staging.migrationPlanCertification.evidenceId !== approval.subject.migrationEvidenceId) fail("migration_evidence_id_mismatch");
  if (staging.migrationPlanCertification.artifactId !== approval.subject.migrationArtifactId) fail("migration_artifact_id_mismatch");
}

export function producePromotionAttestation(input) {
  const { stagingPromotionEvidence, promotionApprovalEvidence, expectedTargetSha } = assertContractInput(input);

  const approval = validatePromotionApprovalEvidence(promotionApprovalEvidence, { expectedSha: expectedTargetSha });

  assertSubjectBinding(stagingPromotionEvidence, approval);

  const issuedAt = new Date().toISOString();
  const verifiedAt = new Date().toISOString();

  const attestation = {
    repository: stagingPromotionEvidence.repository,
    sourceEnvironment: "staging",
    targetEnvironment: "production",
    targetSha: stagingPromotionEvidence.targetSha,
    runtimeCertification: stagingPromotionEvidence.runtimeCertification,
    migrationPlanCertification: stagingPromotionEvidence.migrationPlanCertification,
    founderApproval: approval.founderApproval,
    harmonyGovernanceApproval: approval.harmonyGovernanceApproval,
    issuedAt,
    verifiedAt,
  };

  validatePromotionAttestation(attestation, { expectedSha: expectedTargetSha });
  return attestation;
}

function main() {
  const command = process.argv[2];
  if (command !== "produce") {
    throw new Error("usage: node scripts/ci/produce-promotion-attestation.mjs produce <input-json> <expected-target-sha> <output-json>");
  }

  const inputPath = process.argv[3];
  const expectedTargetSha = process.argv[4];
  const outputPath = process.argv[5];

  if (!inputPath || !expectedTargetSha || !outputPath) {
    throw new Error("usage: node scripts/ci/produce-promotion-attestation.mjs produce <input-json> <expected-target-sha> <output-json>");
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    throw new Error("input_parse_failed");
  }

  const attestation = producePromotionAttestation({
    stagingPromotionEvidence: payload.stagingPromotionEvidence,
    promotionApprovalEvidence: payload.promotionApprovalEvidence,
    expectedTargetSha,
  });

  writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : String(error?.message ?? "produce_failed");
    console.error(code);
    process.exit(1);
  }
}
