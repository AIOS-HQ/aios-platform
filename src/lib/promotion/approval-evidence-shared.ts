import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID = "promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a";

export type PromotionApprovalEvidenceInput = {
  subject: {
    repository: string;
    purpose: string;
    targetSha: string;
    sourceEnvironment: string;
    targetEnvironment: string;
    promotionRequestId: string;
    runtimeEvidenceId: string;
    runtimeArtifactId: string;
    migrationEvidenceId: string;
    migrationArtifactId: string;
  };
  founderApproval: {
    promotionRequestId: string;
    targetSha: string;
    purpose: string;
    authority: "founder";
    decision: "approved";
    actorType: "founder";
    actorId: string;
    evidenceId: string;
    approvedAt: string;
    runtimeEvidenceId: string;
    runtimeArtifactId: string;
    migrationEvidenceId: string;
    migrationArtifactId: string;
  };
  harmonyGovernanceApproval: {
    promotionRequestId: string;
    targetSha: string;
    purpose: string;
    authority: "harmony";
    decision: "approved";
    agentId: "harmony";
    evidenceId: string;
    approvedAt: string;
    governancePolicyVersion: string;
    runtimeEvidenceId: string;
    runtimeArtifactId: string;
    migrationEvidenceId: string;
    migrationArtifactId: string;
  };
};

type PersistedPromotionRequest = {
  promotion_request_id: string;
  repository: string;
  purpose: string;
  target_sha: string;
  source_environment: string;
  target_environment: string;
  runtime_evidence_id: string;
  runtime_artifact_id: string;
  migration_evidence_id: string;
  migration_artifact_id: string;
  preview_certification_waiver: boolean;
  preview_certification_waiver_reason: string | null;
};

export type PromotionPersistenceReadOnlyDiagnostic = {
  requestId: string;
  adminReadAccess: true;
  productionPromotionRequestsQueryable: true;
  productionPromotionDecisionsQueryable: true;
  previewWaiverFieldsQueryable: true;
  waiverRuntimePathSupported: boolean;
  requestExists: boolean;
  founderDecisionExists: boolean;
  harmonyDecisionExists: boolean;
};

function hasSelectOnlyChain(value: unknown): value is {
  select: (...args: unknown[]) => unknown;
  eq: (...args: unknown[]) => unknown;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.select === "function" && typeof candidate.eq === "function";
}

async function runSelectSingle(
  client: SupabaseClient,
  table: "production_promotion_requests" | "production_promotion_decisions",
  projection: string,
  requestId: string,
): Promise<{ data: unknown | null; error: unknown | null }> {
  const root = client.from(table);
  if (!hasSelectOnlyChain(root)) {
    throw new Error("diagnostic_read_chain_invalid");
  }

  const selected = root.select(projection);
  if (!hasSelectOnlyChain(selected)) {
    throw new Error("diagnostic_select_chain_invalid");
  }

  const filtered = selected.eq("promotion_request_id", requestId);
  const maybeSingleCandidate = (filtered as { maybeSingle?: unknown } | null)?.maybeSingle;
  if (typeof maybeSingleCandidate !== "function") {
    throw new Error("diagnostic_eq_chain_invalid");
  }

  return (maybeSingleCandidate as () => Promise<{ data: unknown | null; error: unknown | null }>)();
}

export async function runPromotionPersistenceReadOnlyDiagnosticWithClient(
  client: SupabaseClient,
  requestId: string = PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
): Promise<PromotionPersistenceReadOnlyDiagnostic> {
  const requestProjection = "promotion_request_id,runtime_evidence_id,runtime_artifact_id,preview_certification_waiver,preview_certification_waiver_reason";
  const requestResult = await runSelectSingle(client, "production_promotion_requests", requestProjection, requestId);
  if (requestResult.error) throw new Error("promotion_requests_unqueryable");

  const founderResult = await runSelectSingle(
    client,
    "production_promotion_decisions",
    "promotion_request_id,decision_source",
    requestId,
  );
  if (founderResult.error) throw new Error("promotion_decisions_unqueryable");

  const harmonyResult = await runSelectSingle(
    client,
    "production_promotion_decisions",
    "promotion_request_id,decision_source",
    requestId,
  );
  if (harmonyResult.error) throw new Error("promotion_decisions_unqueryable");

  const request = requestResult.data as Partial<PersistedPromotionRequest> | null;
  const founder = founderResult.data as { decision_source?: unknown } | null;
  const harmony = harmonyResult.data as { decision_source?: unknown } | null;

  const waiverRuntimePathSupported = request
    ? (
      request.preview_certification_waiver === true
        ? typeof request.runtime_evidence_id === "string" && request.runtime_evidence_id.length > 0
          && typeof request.runtime_artifact_id === "string" && request.runtime_artifact_id.length > 0
        : request.runtime_evidence_id === null && request.runtime_artifact_id === null
    )
    : false;

  return {
    requestId,
    adminReadAccess: true,
    productionPromotionRequestsQueryable: true,
    productionPromotionDecisionsQueryable: true,
    previewWaiverFieldsQueryable: true,
    waiverRuntimePathSupported,
    requestExists: request !== null,
    founderDecisionExists: founder?.decision_source === "founder",
    harmonyDecisionExists: harmony?.decision_source === "harmony",
  };
}

type PersistedFounderDecision = {
  promotion_request_id: string;
  decision_source: "founder";
  decision: "approved";
  actor_type: "founder";
  actor_id: string;
  evidence_id: string;
  approved_at: string;
};

type PersistedHarmonyDecision = {
  promotion_request_id: string;
  decision_source: "harmony";
  decision: "approved";
  agent_id: "harmony";
  policy_version: string;
  evidence_id: string;
  approved_at: string;
};

export async function loadPersistedPromotionApprovalEvidenceWithClient(
  client: SupabaseClient,
  promotionRequestId: string,
): Promise<PromotionApprovalEvidenceInput> {
  const requestResult = await client
    .from("production_promotion_requests")
    .select(
      "promotion_request_id,repository,purpose,target_sha,source_environment,target_environment,runtime_evidence_id,runtime_artifact_id,migration_evidence_id,migration_artifact_id",
    )
    .eq("promotion_request_id", promotionRequestId)
    .single();

  if (requestResult.error || !requestResult.data) {
    throw new Error("promotion_request_missing");
  }

  const request = requestResult.data as PersistedPromotionRequest;

  const founderResult = await client
    .from("production_promotion_decisions")
    .select("promotion_request_id,decision_source,decision,actor_type,actor_id,evidence_id,approved_at")
    .eq("promotion_request_id", promotionRequestId)
    .eq("decision_source", "founder")
    .single();

  if (founderResult.error || !founderResult.data) {
    throw new Error("founder_decision_missing");
  }

  const founder = founderResult.data as PersistedFounderDecision;
  if (
    founder.decision !== "approved" ||
    founder.actor_type !== "founder" ||
    !founder.actor_id ||
    !founder.approved_at
  ) {
    throw new Error("founder_decision_invalid");
  }

  const harmonyResult = await client
    .from("production_promotion_decisions")
    .select("promotion_request_id,decision_source,decision,agent_id,policy_version,evidence_id,approved_at")
    .eq("promotion_request_id", promotionRequestId)
    .eq("decision_source", "harmony")
    .single();

  if (harmonyResult.error || !harmonyResult.data) {
    throw new Error("harmony_decision_missing");
  }

  const harmony = harmonyResult.data as PersistedHarmonyDecision;
  if (
    harmony.decision !== "approved" ||
    harmony.agent_id !== "harmony" ||
    !harmony.policy_version ||
    !harmony.approved_at
  ) {
    throw new Error("harmony_decision_invalid");
  }

  return {
    subject: {
      repository: request.repository,
      purpose: request.purpose,
      targetSha: request.target_sha,
      sourceEnvironment: request.source_environment,
      targetEnvironment: request.target_environment,
      promotionRequestId: request.promotion_request_id,
      runtimeEvidenceId: request.runtime_evidence_id,
      runtimeArtifactId: request.runtime_artifact_id,
      migrationEvidenceId: request.migration_evidence_id,
      migrationArtifactId: request.migration_artifact_id,
    },
    founderApproval: {
      promotionRequestId: request.promotion_request_id,
      targetSha: request.target_sha,
      purpose: request.purpose,
      authority: founder.decision_source,
      decision: founder.decision,
      actorType: founder.actor_type,
      actorId: founder.actor_id,
      evidenceId: founder.evidence_id,
      approvedAt: founder.approved_at,
      runtimeEvidenceId: request.runtime_evidence_id,
      runtimeArtifactId: request.runtime_artifact_id,
      migrationEvidenceId: request.migration_evidence_id,
      migrationArtifactId: request.migration_artifact_id,
    },
    harmonyGovernanceApproval: {
      promotionRequestId: request.promotion_request_id,
      targetSha: request.target_sha,
      purpose: request.purpose,
      authority: harmony.decision_source,
      decision: harmony.decision,
      agentId: harmony.agent_id,
      evidenceId: harmony.evidence_id,
      approvedAt: harmony.approved_at,
      governancePolicyVersion: harmony.policy_version,
      runtimeEvidenceId: request.runtime_evidence_id,
      runtimeArtifactId: request.runtime_artifact_id,
      migrationEvidenceId: request.migration_evidence_id,
      migrationArtifactId: request.migration_artifact_id,
    },
  };
}
