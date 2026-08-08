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
