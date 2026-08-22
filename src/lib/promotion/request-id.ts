import { createHash } from "node:crypto";

export const GOVERNED_PROMOTION_REPOSITORY = "AIOS-HQ/aios-platform";
export const GOVERNED_PROMOTION_PURPOSE = "production_promotion";
export const GOVERNED_SOURCE_ENVIRONMENT = "staging";
export const GOVERNED_TARGET_ENVIRONMENT = "production";
export const GOVERNED_PREVIEW_WAIVER_REASON = "preview_certification_contract_incompatibility";

export const M5_BOOTSTRAP_TARGET_SHA = "02ab3a7a083c56feb17211fa62c85b3bacfce34a";
export const M5_BOOTSTRAP_MIGRATION_EVIDENCE_ID = "migration:7129b9249d0d44f98a09ae043db8885a4aa7205c5fa44b1392bf532bd1cc4ff6";
export const M5_BOOTSTRAP_MIGRATION_ARTIFACT_ID = "github-artifact:9263764663";

export type GovernedPromotionRequestTuple = {
  repository: string;
  purpose: string;
  target_sha: string;
  source_environment: string;
  target_environment: string;
  runtime_evidence_id: string | null;
  runtime_artifact_id: string | null;
  migration_evidence_id: string;
  migration_artifact_id: string;
  preview_certification_waiver: boolean;
  preview_certification_waiver_reason: string | null;
};

export const M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE: GovernedPromotionRequestTuple = {
  repository: GOVERNED_PROMOTION_REPOSITORY,
  purpose: GOVERNED_PROMOTION_PURPOSE,
  target_sha: M5_BOOTSTRAP_TARGET_SHA,
  source_environment: GOVERNED_SOURCE_ENVIRONMENT,
  target_environment: GOVERNED_TARGET_ENVIRONMENT,
  runtime_evidence_id: null,
  runtime_artifact_id: null,
  migration_evidence_id: M5_BOOTSTRAP_MIGRATION_EVIDENCE_ID,
  migration_artifact_id: M5_BOOTSTRAP_MIGRATION_ARTIFACT_ID,
  preview_certification_waiver: true,
  preview_certification_waiver_reason: GOVERNED_PREVIEW_WAIVER_REASON,
};

function normalizeNullable(value: string | null) {
  return value ?? "";
}

export function derivePromotionRequestId(tuple: GovernedPromotionRequestTuple): string {
  const material = [
    tuple.repository,
    tuple.purpose,
    tuple.target_sha,
    tuple.source_environment,
    tuple.target_environment,
    normalizeNullable(tuple.runtime_evidence_id),
    normalizeNullable(tuple.runtime_artifact_id),
    tuple.migration_evidence_id,
    tuple.migration_artifact_id,
    tuple.preview_certification_waiver ? "true" : "false",
    normalizeNullable(tuple.preview_certification_waiver_reason),
  ].join("|");

  return `promotion-request:${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

export function assertPromotionRequestIdMatchesDerived(
  suppliedPromotionRequestId: string,
  tuple: GovernedPromotionRequestTuple,
): string {
  const derivedPromotionRequestId = derivePromotionRequestId(tuple);
  if (suppliedPromotionRequestId !== derivedPromotionRequestId) {
    throw new Error("promotion_request_id_mismatch");
  }
  return derivedPromotionRequestId;
}

export const M5_BOOTSTRAP_PROMOTION_REQUEST_ID = derivePromotionRequestId(M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE);
