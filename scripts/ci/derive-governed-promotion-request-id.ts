import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GOVERNED_PREVIEW_WAIVER_REASON,
  GOVERNED_PROMOTION_PURPOSE,
  GOVERNED_PROMOTION_REPOSITORY,
  GOVERNED_SOURCE_ENVIRONMENT,
  GOVERNED_TARGET_ENVIRONMENT,
  M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE,
  type GovernedPromotionRequestTuple,
  assertPromotionRequestIdMatchesDerived,
  derivePromotionRequestId,
} from "../../src/lib/promotion/request-id";

type StagingMigrationPlanArtifact = {
  repository: string;
  targetSha: string;
  validatorSha256: string;
  workflowRun: {
    runId: string;
    runAttempt: number;
  };
};

type StagingPromotionEvidence = {
  repository: string;
  targetSha: string;
  sourceEnvironment: string;
  targetEnvironment: string;
  runtimeCertification: {
    status?: string;
    evidenceId?: string | null;
    artifactId?: string | null;
    waiver?: boolean;
    waiverReason?: string | null;
  };
  migrationPlanCertification: {
    evidenceId?: string;
    artifactId?: string;
  };
};

type PromotionAttestationArtifact = {
  repository: string;
  targetSha: string;
  sourceEnvironment: string;
  targetEnvironment: string;
  runtimeCertification: {
    status?: string;
    evidenceId?: string | null;
    artifactId?: string | null;
    waiver?: boolean;
    waiverReason?: string | null;
  };
  migrationPlanCertification: {
    evidenceId?: string;
    artifactId?: string;
  };
};

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]*$/;

function fail(code: string): never {
  const error = new Error(code);
  (error as Error & { code?: string }).code = code;
  throw error;
}

function assertSha40(value: string, code: string): string {
  if (!SHA40.test(value)) fail(code);
  return value;
}

function assertSha256(value: string, code: string): string {
  if (!SHA256.test(value)) fail(code);
  return value;
}

function assertRunIdentity(value: string, code: string): string {
  if (!RUN_ID.test(value)) fail(code);
  return value;
}

function assertImmutableRef(value: string, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) fail(code);
  const lowered = normalized.toLowerCase();
  if (lowered.includes("latest") || lowered.includes("head") || lowered === "main") fail(code);
  return normalized;
}

function assertObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function parseJsonFile(path: string, code: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, "utf8");
    return assertObject(JSON.parse(raw), code);
  } catch {
    fail(code);
  }
}

function deriveMigrationEvidenceId(
  targetSha: string,
  validatorSha256: string,
  workflowRunId: string,
  workflowRunAttempt: number,
): string {
  const material = [targetSha, validatorSha256, workflowRunId, String(workflowRunAttempt)].join(":");
  return `migration:${createHash("sha256").update(material).digest("hex")}`;
}

export function deriveBootstrapTupleFromStagingArtifact(
  targetSha: string,
  stagingMigrationArtifactPath: string,
  migrationArtifactId: string,
): GovernedPromotionRequestTuple {
  const parsed = parseJsonFile(stagingMigrationArtifactPath, "staging_migration_artifact_parse_failed");

  const artifact = parsed as Partial<StagingMigrationPlanArtifact>;
  if (artifact.repository !== GOVERNED_PROMOTION_REPOSITORY) fail("staging_migration_repository_mismatch");

  const artifactTargetSha = assertSha40(String(artifact.targetSha ?? ""), "staging_migration_target_sha_invalid");
  if (artifactTargetSha !== targetSha) fail("staging_migration_target_sha_mismatch");

  const validatorSha256 = assertSha256(String(artifact.validatorSha256 ?? ""), "staging_migration_validator_sha256_invalid");

  const workflowRun = assertObject(artifact.workflowRun, "staging_migration_workflow_run_missing");
  const workflowRunId = assertRunIdentity(String(workflowRun.runId ?? ""), "staging_migration_workflow_run_id_invalid");
  const workflowRunAttempt = Number(workflowRun.runAttempt);
  if (!Number.isInteger(workflowRunAttempt) || workflowRunAttempt < 1) fail("staging_migration_workflow_run_attempt_invalid");

  const immutableMigrationArtifactId = assertImmutableRef(migrationArtifactId, "migration_artifact_id_invalid");
  const migrationEvidenceId = deriveMigrationEvidenceId(
    artifactTargetSha,
    validatorSha256,
    workflowRunId,
    workflowRunAttempt,
  );

  return {
    repository: GOVERNED_PROMOTION_REPOSITORY,
    purpose: GOVERNED_PROMOTION_PURPOSE,
    target_sha: artifactTargetSha,
    source_environment: GOVERNED_SOURCE_ENVIRONMENT,
    target_environment: GOVERNED_TARGET_ENVIRONMENT,
    runtime_evidence_id: null,
    runtime_artifact_id: null,
    migration_evidence_id: migrationEvidenceId,
    migration_artifact_id: immutableMigrationArtifactId,
    preview_certification_waiver: true,
    preview_certification_waiver_reason: GOVERNED_PREVIEW_WAIVER_REASON,
  };
}

export function deriveTupleFromStagingPromotionEvidence(
  stagingPromotionEvidencePath: string,
): GovernedPromotionRequestTuple {
  const parsed = parseJsonFile(stagingPromotionEvidencePath, "staging_promotion_evidence_parse_failed") as Partial<StagingPromotionEvidence>;

  if (parsed.repository !== GOVERNED_PROMOTION_REPOSITORY) fail("staging_promotion_repository_mismatch");
  if (parsed.sourceEnvironment !== GOVERNED_SOURCE_ENVIRONMENT) fail("staging_promotion_source_environment_mismatch");
  if (parsed.targetEnvironment !== GOVERNED_TARGET_ENVIRONMENT) fail("staging_promotion_target_environment_mismatch");

  const targetSha = assertSha40(String(parsed.targetSha ?? ""), "staging_promotion_target_sha_invalid");

  const runtimeCertification = assertObject(parsed.runtimeCertification, "staging_promotion_runtime_cert_missing");
  const migrationPlanCertification = assertObject(parsed.migrationPlanCertification, "staging_promotion_migration_cert_missing");

  const migrationEvidenceId = assertImmutableRef(String(migrationPlanCertification.evidenceId ?? ""), "migration_evidence_id_invalid");
  const migrationArtifactId = assertImmutableRef(String(migrationPlanCertification.artifactId ?? ""), "migration_artifact_id_invalid");

  const runtimeWaiver = runtimeCertification.waiver === true || runtimeCertification.status === "waived";
  const runtimeEvidenceId = runtimeCertification.evidenceId == null ? null : assertImmutableRef(String(runtimeCertification.evidenceId), "runtime_evidence_id_invalid");
  const runtimeArtifactId = runtimeCertification.artifactId == null ? null : assertImmutableRef(String(runtimeCertification.artifactId), "runtime_artifact_id_invalid");
  const waiverReason = runtimeCertification.waiverReason == null ? null : String(runtimeCertification.waiverReason);

  if (runtimeWaiver) {
    if (runtimeEvidenceId !== null || runtimeArtifactId !== null) fail("runtime_waiver_runtime_shape_invalid");
    if (waiverReason !== GOVERNED_PREVIEW_WAIVER_REASON) fail("runtime_waiver_reason_invalid");
  } else {
    if (runtimeEvidenceId === null || runtimeArtifactId === null) fail("runtime_evidence_missing");
    if (waiverReason !== null) fail("runtime_waiver_reason_unexpected");
  }

  return {
    repository: GOVERNED_PROMOTION_REPOSITORY,
    purpose: GOVERNED_PROMOTION_PURPOSE,
    target_sha: targetSha,
    source_environment: GOVERNED_SOURCE_ENVIRONMENT,
    target_environment: GOVERNED_TARGET_ENVIRONMENT,
    runtime_evidence_id: runtimeEvidenceId,
    runtime_artifact_id: runtimeArtifactId,
    migration_evidence_id: migrationEvidenceId,
    migration_artifact_id: migrationArtifactId,
    preview_certification_waiver: runtimeWaiver,
    preview_certification_waiver_reason: runtimeWaiver ? GOVERNED_PREVIEW_WAIVER_REASON : null,
  };
}

export function deriveTupleFromPromotionAttestation(
  promotionAttestationPath: string,
): GovernedPromotionRequestTuple {
  const parsed = parseJsonFile(promotionAttestationPath, "promotion_attestation_parse_failed") as Partial<PromotionAttestationArtifact>;

  if (parsed.repository !== GOVERNED_PROMOTION_REPOSITORY) fail("promotion_attestation_repository_mismatch");
  if (parsed.sourceEnvironment !== GOVERNED_SOURCE_ENVIRONMENT) fail("promotion_attestation_source_environment_mismatch");
  if (parsed.targetEnvironment !== GOVERNED_TARGET_ENVIRONMENT) fail("promotion_attestation_target_environment_mismatch");

  const targetSha = assertSha40(String(parsed.targetSha ?? ""), "promotion_attestation_target_sha_invalid");

  const runtimeCertification = assertObject(parsed.runtimeCertification, "promotion_attestation_runtime_cert_missing");
  const migrationPlanCertification = assertObject(parsed.migrationPlanCertification, "promotion_attestation_migration_cert_missing");

  const migrationEvidenceId = assertImmutableRef(String(migrationPlanCertification.evidenceId ?? ""), "migration_evidence_id_invalid");
  const migrationArtifactId = assertImmutableRef(String(migrationPlanCertification.artifactId ?? ""), "migration_artifact_id_invalid");

  const runtimeWaiver = runtimeCertification.waiver === true || runtimeCertification.status === "waived";
  const runtimeEvidenceId = runtimeCertification.evidenceId == null ? null : assertImmutableRef(String(runtimeCertification.evidenceId), "runtime_evidence_id_invalid");
  const runtimeArtifactId = runtimeCertification.artifactId == null ? null : assertImmutableRef(String(runtimeCertification.artifactId), "runtime_artifact_id_invalid");
  const waiverReason = runtimeCertification.waiverReason == null ? null : String(runtimeCertification.waiverReason);

  if (runtimeWaiver) {
    if (runtimeEvidenceId !== null || runtimeArtifactId !== null) fail("runtime_waiver_runtime_shape_invalid");
    if (waiverReason !== GOVERNED_PREVIEW_WAIVER_REASON) fail("runtime_waiver_reason_invalid");
  } else {
    if (runtimeEvidenceId === null || runtimeArtifactId === null) fail("runtime_evidence_missing");
    if (waiverReason !== null) fail("runtime_waiver_reason_unexpected");
  }

  return {
    repository: GOVERNED_PROMOTION_REPOSITORY,
    purpose: GOVERNED_PROMOTION_PURPOSE,
    target_sha: targetSha,
    source_environment: GOVERNED_SOURCE_ENVIRONMENT,
    target_environment: GOVERNED_TARGET_ENVIRONMENT,
    runtime_evidence_id: runtimeEvidenceId,
    runtime_artifact_id: runtimeArtifactId,
    migration_evidence_id: migrationEvidenceId,
    migration_artifact_id: migrationArtifactId,
    preview_certification_waiver: runtimeWaiver,
    preview_certification_waiver_reason: runtimeWaiver ? GOVERNED_PREVIEW_WAIVER_REASON : null,
  };
}

function emitResult(tuple: GovernedPromotionRequestTuple) {
  const promotionRequestId = derivePromotionRequestId(tuple);
  process.stdout.write(`derived_promotion_request_id=${promotionRequestId}\n`);
  process.stdout.write(`migration_evidence_id=${tuple.migration_evidence_id}\n`);
  process.stdout.write(`migration_artifact_id=${tuple.migration_artifact_id}\n`);
}

function validateSuppliedRequestId(suppliedPromotionRequestId: string | undefined, tuple: GovernedPromotionRequestTuple) {
  if (suppliedPromotionRequestId === undefined || suppliedPromotionRequestId.trim() === "") return;
  assertPromotionRequestIdMatchesDerived(suppliedPromotionRequestId, tuple);
}

function main() {
  const command = process.argv[2];

  if (command === "bootstrap-staging") {
    const targetSha = assertSha40(String(process.argv[3] ?? ""), "target_sha_invalid");
    const migrationArtifactId = String(process.argv[4] ?? "");
    const stagingMigrationArtifactPath = String(process.argv[5] ?? "");
    const suppliedPromotionRequestId = process.argv[6];

    if (!stagingMigrationArtifactPath.trim()) fail("staging_migration_artifact_path_missing");

    const tuple = deriveBootstrapTupleFromStagingArtifact(targetSha, stagingMigrationArtifactPath, migrationArtifactId);
    validateSuppliedRequestId(suppliedPromotionRequestId, tuple);
    emitResult(tuple);
    return;
  }

  if (command === "from-staging-evidence") {
    const stagingPromotionEvidencePath = String(process.argv[3] ?? "");
    const suppliedPromotionRequestId = process.argv[4];
    if (!stagingPromotionEvidencePath.trim()) fail("staging_promotion_evidence_path_missing");

    const tuple = deriveTupleFromStagingPromotionEvidence(stagingPromotionEvidencePath);
    validateSuppliedRequestId(suppliedPromotionRequestId, tuple);
    emitResult(tuple);
    return;
  }

  if (command === "from-promotion-attestation") {
    const promotionAttestationPath = String(process.argv[3] ?? "");
    const suppliedPromotionRequestId = process.argv[4];
    if (!promotionAttestationPath.trim()) fail("promotion_attestation_path_missing");

    const tuple = deriveTupleFromPromotionAttestation(promotionAttestationPath);
    validateSuppliedRequestId(suppliedPromotionRequestId, tuple);
    emitResult(tuple);
    return;
  }

  if (command === "m5-bootstrap-default") {
    const suppliedPromotionRequestId = process.argv[3];
    validateSuppliedRequestId(suppliedPromotionRequestId, M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE);
    emitResult(M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE);
    return;
  }

  fail("unsupported_command");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const safeCode = error && typeof error === "object" && "code" in error && error.code
      ? String(error.code)
      : String((error as Error | undefined)?.message ?? "derive_governed_promotion_request_id_failed");
    console.error(safeCode);
    process.exit(1);
  }
}
