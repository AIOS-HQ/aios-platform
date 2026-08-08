import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

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
};

type PersistedFounderDecision = {
  promotion_request_id: string;
  decision_source: "founder";
  decision: string;
  actor_type: string | null;
  actor_id: string | null;
  evidence_id: string;
  approved_at: string | null;
};

type PersistedHarmonyDecision = {
  promotion_request_id: string;
  decision_source: "harmony";
  decision: string;
  agent_id: string | null;
  policy_version: string | null;
  evidence_id: string;
  approved_at: string | null;
};

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

export async function loadPersistedPromotionApprovalEvidence(
  promotionRequestId: string,
): Promise<PromotionApprovalEvidenceInput> {
  const admin = createAdminClient();
  if (!admin) throw new Error("supabase_admin_unavailable");

  const requestResult = await admin
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

  const founderResult = await admin
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

  const harmonyResult = await admin
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
