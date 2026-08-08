import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type PromotionDecision = "approved" | "rejected";

const HARMONY_POLICY_VERSION = "production-promotion-governance-v1";

type PromotionRequestInsert = {
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
  created_by: string;
};

type FounderDecisionInsert = {
  promotion_request_id: string;
  decision_source: "founder";
  decision: PromotionDecision;
  actor_type: "founder";
  actor_id: string;
  agent_id: null;
  policy_version: null;
  evidence_id: string;
  decided_at: string;
  approved_at: string | null;
};

type HarmonyDecisionInsert = {
  promotion_request_id: string;
  decision_source: "harmony";
  decision: PromotionDecision;
  actor_type: null;
  actor_id: null;
  agent_id: "harmony";
  policy_version: typeof HARMONY_POLICY_VERSION;
  evidence_id: string;
  decided_at: string;
  approved_at: string | null;
};

type PromotionEvidenceWriteInput = {
  request: PromotionRequestInsert;
  actorId: string;
  decision: PromotionDecision;
};

type PromotionEvidenceWriteResult = {
  request: PromotionRequestInsert;
  decision: FounderDecisionInsert;
};

type HarmonyEvidenceWriteInput = {
  promotionRequestId: string;
};

type HarmonyEvidenceWriteResult = {
  request: PromotionRequestInsert;
  decision: HarmonyDecisionInsert;
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

function stableFounderEvidenceId(input: { promotionRequestId: string; actorId: string; decision: PromotionDecision }) {
  const digest = createHash("sha256")
    .update(input.promotionRequestId)
    .update("|")
    .update(input.actorId)
    .update("|")
    .update(input.decision)
    .digest("hex")
    .slice(0, 24);
  return `founder-${digest}-${randomUUID()}`;
}

function stableHarmonyEvidenceId(input: { promotionRequestId: string; decision: PromotionDecision; policyVersion: string }) {
  const digest = createHash("sha256")
    .update(input.promotionRequestId)
    .update("|")
    .update(input.decision)
    .update("|")
    .update(input.policyVersion)
    .digest("hex")
    .slice(0, 24);
  return `harmony-${digest}-${randomUUID()}`;
}

async function selectExistingFounderDecision(
  client: AdminClient,
  promotionRequestId: string,
): Promise<
  QueryResult<
    Pick<
      FounderDecisionInsert,
      "decision_source" | "decision" | "actor_type" | "actor_id" | "evidence_id" | "decided_at" | "approved_at"
    >
  >
> {
  return client
    .from("production_promotion_decisions")
    .select("decision_source,decision,actor_type,actor_id,evidence_id,decided_at,approved_at")
    .eq("promotion_request_id", promotionRequestId)
    .eq("decision_source", "founder")
    .maybeSingle();
}

async function selectExistingHarmonyDecision(
  client: AdminClient,
  promotionRequestId: string,
): Promise<
  QueryResult<
    Pick<
      HarmonyDecisionInsert,
      | "decision_source"
      | "decision"
      | "actor_type"
      | "actor_id"
      | "agent_id"
      | "policy_version"
      | "evidence_id"
      | "decided_at"
      | "approved_at"
    >
  >
> {
  return client
    .from("production_promotion_decisions")
    .select("decision_source,decision,actor_type,actor_id,agent_id,policy_version,evidence_id,decided_at,approved_at")
    .eq("promotion_request_id", promotionRequestId)
    .eq("decision_source", "harmony")
    .maybeSingle();
}

function assertSameRequest(existing: PromotionRequestInsert, incoming: PromotionRequestInsert) {
  const keys = Object.keys(incoming) as Array<keyof PromotionRequestInsert>;
  for (const key of keys) {
    if (existing[key] !== incoming[key]) {
      throw new Error("promotion_request_conflict");
    }
  }
}

function isLowerHexSha40(value: string) {
  return /^[0-9a-f]{40}$/.test(value);
}

function immutableId(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes("latest") && !normalized.includes("head") && normalized !== "main";
}

function evaluateHarmonyDecision(request: PromotionRequestInsert): PromotionDecision {
  const valid =
    request.repository === "AIOS-HQ/aios-platform" &&
    request.purpose === "production_promotion" &&
    isLowerHexSha40(request.target_sha) &&
    request.source_environment === "staging" &&
    request.target_environment === "production" &&
    immutableId(request.runtime_evidence_id) &&
    immutableId(request.runtime_artifact_id) &&
    immutableId(request.migration_evidence_id) &&
    immutableId(request.migration_artifact_id);

  return valid ? "approved" : "rejected";
}

async function getPersistedRequest(client: AdminClient, promotionRequestId: string): Promise<PromotionRequestInsert> {
  const result = await client
    .from("production_promotion_requests")
    .select(
      "promotion_request_id,repository,purpose,target_sha,source_environment,target_environment,runtime_evidence_id,runtime_artifact_id,migration_evidence_id,migration_artifact_id,created_by",
    )
    .eq("promotion_request_id", promotionRequestId)
    .single();

  if (result.error || !result.data) {
    throw result.error ?? new Error("promotion_request_not_found");
  }

  return result.data;
}

export async function writeFounderPromotionEvidence(input: PromotionEvidenceWriteInput): Promise<PromotionEvidenceWriteResult> {
  const admin = createAdminClient();
  if (!admin) throw new Error("supabase_admin_unavailable");

  const decidedAt = new Date().toISOString();
  const approvedAt = input.decision === "approved" ? decidedAt : null;

  const requestInsertResult = await admin
    .from("production_promotion_requests")
    .insert(input.request)
    .select(
      "promotion_request_id,repository,purpose,target_sha,source_environment,target_environment,runtime_evidence_id,runtime_artifact_id,migration_evidence_id,migration_artifact_id,created_by",
    )
    .single();

  if (requestInsertResult.error) {
    if (requestInsertResult.error.code !== "23505") throw requestInsertResult.error;

    const existingRequestResult = await admin
      .from("production_promotion_requests")
      .select(
        "promotion_request_id,repository,purpose,target_sha,source_environment,target_environment,runtime_evidence_id,runtime_artifact_id,migration_evidence_id,migration_artifact_id,created_by",
      )
      .eq("promotion_request_id", input.request.promotion_request_id)
      .single();

    if (existingRequestResult.error || !existingRequestResult.data) {
      throw existingRequestResult.error ?? new Error("promotion_request_not_found_after_conflict");
    }

    assertSameRequest(existingRequestResult.data, input.request);
  }

  const decisionInsert: FounderDecisionInsert = {
    promotion_request_id: input.request.promotion_request_id,
    decision_source: "founder",
    decision: input.decision,
    actor_type: "founder",
    actor_id: input.actorId,
    agent_id: null,
    policy_version: null,
    evidence_id: stableFounderEvidenceId({
      promotionRequestId: input.request.promotion_request_id,
      actorId: input.actorId,
      decision: input.decision,
    }),
    decided_at: decidedAt,
    approved_at: approvedAt,
  };

  const decisionInsertResult = await admin
    .from("production_promotion_decisions")
    .insert(decisionInsert)
    .select("promotion_request_id,decision_source,decision,actor_type,actor_id,agent_id,policy_version,evidence_id,decided_at,approved_at")
    .single();

  if (!decisionInsertResult.error && decisionInsertResult.data) {
    return {
      request: input.request,
      decision: decisionInsertResult.data,
    };
  }

  if (decisionInsertResult.error?.code !== "23505") {
    throw decisionInsertResult.error;
  }

  const existingDecisionResult = await selectExistingFounderDecision(admin, input.request.promotion_request_id);
  if (existingDecisionResult.error || !existingDecisionResult.data) {
    throw existingDecisionResult.error ?? new Error("promotion_decision_not_found_after_conflict");
  }

  const existing = existingDecisionResult.data;

  if (existing.decision === "rejected" && input.decision === "approved") {
    throw new Error("promotion_decision_rejected_immutable");
  }

  if (existing.decision !== input.decision || existing.actor_id !== input.actorId) {
    throw new Error("promotion_decision_conflict");
  }

  return {
    request: input.request,
    decision: existing,
  };
}

export async function writeHarmonyPromotionDecision(input: HarmonyEvidenceWriteInput): Promise<HarmonyEvidenceWriteResult> {
  const admin = createAdminClient();
  if (!admin) throw new Error("supabase_admin_unavailable");

  const request = await getPersistedRequest(admin, input.promotionRequestId);
  const decision = evaluateHarmonyDecision(request);
  const decidedAt = new Date().toISOString();
  const approvedAt = decision === "approved" ? decidedAt : null;

  const decisionInsert: HarmonyDecisionInsert = {
    promotion_request_id: request.promotion_request_id,
    decision_source: "harmony",
    decision,
    actor_type: null,
    actor_id: null,
    agent_id: "harmony",
    policy_version: HARMONY_POLICY_VERSION,
    evidence_id: stableHarmonyEvidenceId({
      promotionRequestId: request.promotion_request_id,
      decision,
      policyVersion: HARMONY_POLICY_VERSION,
    }),
    decided_at: decidedAt,
    approved_at: approvedAt,
  };

  const decisionInsertResult = await admin
    .from("production_promotion_decisions")
    .insert(decisionInsert)
    .select("promotion_request_id,decision_source,decision,actor_type,actor_id,agent_id,policy_version,evidence_id,decided_at,approved_at")
    .single();

  if (!decisionInsertResult.error && decisionInsertResult.data) {
    return {
      request,
      decision: decisionInsertResult.data,
    };
  }

  if (decisionInsertResult.error?.code !== "23505") {
    throw decisionInsertResult.error;
  }

  const existingDecisionResult = await selectExistingHarmonyDecision(admin, request.promotion_request_id);
  if (existingDecisionResult.error || !existingDecisionResult.data) {
    throw existingDecisionResult.error ?? new Error("harmony_decision_not_found_after_conflict");
  }

  const existing = existingDecisionResult.data;
  if (
    existing.decision !== decision ||
    existing.agent_id !== "harmony" ||
    existing.policy_version !== HARMONY_POLICY_VERSION
  ) {
    throw new Error("harmony_decision_conflict");
  }

  return {
    request,
    decision: existing,
  };
}

export { HARMONY_POLICY_VERSION };
