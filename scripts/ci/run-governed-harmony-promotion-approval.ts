import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  runPromotionPersistenceReadOnlyDiagnosticWithClient,
} from "../../src/lib/promotion/approval-evidence-shared";
import {
  HARMONY_POLICY_VERSION,
  writeHarmonyPromotionDecision,
} from "../../src/lib/promotion/evidence-store";
import {
  GOVERNED_PREVIEW_WAIVER_REASON,
  M5_BOOTSTRAP_MIGRATION_ARTIFACT_ID,
  M5_BOOTSTRAP_MIGRATION_EVIDENCE_ID,
  M5_BOOTSTRAP_PROMOTION_REQUEST_ID,
  M5_BOOTSTRAP_TARGET_SHA,
} from "../../src/lib/promotion/request-id";

type PersistedPromotionRequest = {
  promotion_request_id: string;
  target_sha: string;
  migration_evidence_id: string;
  migration_artifact_id: string;
  runtime_evidence_id: string | null;
  runtime_artifact_id: string | null;
  preview_certification_waiver: boolean;
  preview_certification_waiver_reason: string | null;
};

type GovernedHarmonyApprovalArtifact = {
  promotionRequestId: string;
  targetSha: string;
  migrationEvidenceId: string;
  migrationArtifactId: string;
  founderDecisionExistsBefore: boolean;
  harmonyDecisionExistsAfter: boolean;
  harmonyDecision: {
    source: "harmony";
    decision: "approved";
    evidenceId: string;
    policyVersion: string;
    approvedAt: string | null;
  };
  diagnosticBefore: {
    requestExists: boolean;
    founderDecisionExists: boolean;
    harmonyDecisionExists: boolean;
  };
  diagnosticAfter: {
    requestExists: boolean;
    founderDecisionExists: boolean;
    harmonyDecisionExists: boolean;
  };
  verifiedAt: string;
};

function fail(code: string): never {
  throw new Error(code);
}

function assertImmutableRef(value: string, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) fail(code);
  const lowered = normalized.toLowerCase();
  if (lowered.includes("latest") || lowered.includes("head") || lowered === "main") fail(code);
  return normalized;
}

function assertCanonicalPromotionRequestId(promotionRequestId: string): string {
  const immutablePromotionRequestId = assertImmutableRef(
    promotionRequestId,
    "promotion_request_id_missing",
  );

  if (immutablePromotionRequestId !== M5_BOOTSTRAP_PROMOTION_REQUEST_ID) {
    fail("promotion_request_id_not_authorized");
  }

  return immutablePromotionRequestId;
}

function createAdminReadClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) fail("supabase_admin_unavailable");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertPersistedRequestMatchesGovernedTuple(request: PersistedPromotionRequest) {
  if (request.promotion_request_id !== M5_BOOTSTRAP_PROMOTION_REQUEST_ID) {
    fail("promotion_request_id_mismatch");
  }
  if (request.target_sha !== M5_BOOTSTRAP_TARGET_SHA) {
    fail("target_sha_mismatch");
  }
  if (request.migration_evidence_id !== M5_BOOTSTRAP_MIGRATION_EVIDENCE_ID) {
    fail("migration_evidence_id_mismatch");
  }
  if (request.migration_artifact_id !== M5_BOOTSTRAP_MIGRATION_ARTIFACT_ID) {
    fail("migration_artifact_id_mismatch");
  }
  if (request.preview_certification_waiver !== true) {
    fail("preview_waiver_required");
  }
  if (request.preview_certification_waiver_reason !== GOVERNED_PREVIEW_WAIVER_REASON) {
    fail("preview_waiver_reason_mismatch");
  }
  if (request.runtime_evidence_id !== null || request.runtime_artifact_id !== null) {
    fail("preview_waiver_runtime_shape_invalid");
  }
}

export async function runGovernedHarmonyPromotionApproval(
  promotionRequestId: string,
  outputPath = "production-harmony-governed-approval.json",
): Promise<GovernedHarmonyApprovalArtifact> {
  const immutablePromotionRequestId = assertCanonicalPromotionRequestId(promotionRequestId);
  const adminReadClient = createAdminReadClient();

  const diagnosticBefore = await runPromotionPersistenceReadOnlyDiagnosticWithClient(
    adminReadClient,
    immutablePromotionRequestId,
  );

  if (!diagnosticBefore.requestExists) fail("promotion_request_missing_precondition");
  if (!diagnosticBefore.founderDecisionExists) fail("founder_decision_missing_precondition");

  const requestResult = await adminReadClient
    .from("production_promotion_requests")
    .select(
      "promotion_request_id,target_sha,migration_evidence_id,migration_artifact_id,runtime_evidence_id,runtime_artifact_id,preview_certification_waiver,preview_certification_waiver_reason",
    )
    .eq("promotion_request_id", immutablePromotionRequestId)
    .single();

  if (requestResult.error || !requestResult.data) {
    fail("promotion_request_missing_precondition");
  }

  assertPersistedRequestMatchesGovernedTuple(requestResult.data as PersistedPromotionRequest);

  const harmonyWrite = await writeHarmonyPromotionDecision({
    promotionRequestId: immutablePromotionRequestId,
  });

  if (harmonyWrite.decision.decision_source !== "harmony") {
    fail("harmony_decision_source_invalid");
  }
  if (harmonyWrite.decision.decision !== "approved") {
    fail("harmony_decision_not_approved");
  }
  if (harmonyWrite.decision.policy_version !== HARMONY_POLICY_VERSION) {
    fail("harmony_policy_version_mismatch");
  }

  const diagnosticAfter = await runPromotionPersistenceReadOnlyDiagnosticWithClient(
    adminReadClient,
    immutablePromotionRequestId,
  );

  if (!diagnosticAfter.harmonyDecisionExists) {
    fail("harmony_decision_not_persisted");
  }

  const artifact: GovernedHarmonyApprovalArtifact = {
    promotionRequestId: immutablePromotionRequestId,
    targetSha: M5_BOOTSTRAP_TARGET_SHA,
    migrationEvidenceId: M5_BOOTSTRAP_MIGRATION_EVIDENCE_ID,
    migrationArtifactId: M5_BOOTSTRAP_MIGRATION_ARTIFACT_ID,
    founderDecisionExistsBefore: diagnosticBefore.founderDecisionExists,
    harmonyDecisionExistsAfter: diagnosticAfter.harmonyDecisionExists,
    harmonyDecision: {
      source: "harmony",
      decision: "approved",
      evidenceId: harmonyWrite.decision.evidence_id,
      policyVersion: harmonyWrite.decision.policy_version,
      approvedAt: harmonyWrite.decision.approved_at,
    },
    diagnosticBefore: {
      requestExists: diagnosticBefore.requestExists,
      founderDecisionExists: diagnosticBefore.founderDecisionExists,
      harmonyDecisionExists: diagnosticBefore.harmonyDecisionExists,
    },
    diagnosticAfter: {
      requestExists: diagnosticAfter.requestExists,
      founderDecisionExists: diagnosticAfter.founderDecisionExists,
      harmonyDecisionExists: diagnosticAfter.harmonyDecisionExists,
    },
    verifiedAt: new Date().toISOString(),
  };

  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

async function main() {
  const promotionRequestId = process.argv[2];
  const outputPath = process.argv[3] ?? "production-harmony-governed-approval.json";

  if (!promotionRequestId) {
    fail("usage: run-governed-harmony-promotion-approval <promotion-request-id> [output-path]");
  }

  const artifact = await runGovernedHarmonyPromotionApproval(promotionRequestId, outputPath);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const safeCode = error instanceof Error && error.message
      ? error.message
      : "run_governed_harmony_promotion_approval_failed";
    console.error(safeCode);
    process.exit(1);
  });
}
