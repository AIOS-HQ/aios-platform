import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type PromotionDecision = "approved" | "rejected";

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

type PromotionDecisionInsert = {
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

type PromotionEvidenceWriteInput = {
  request: PromotionRequestInsert;
  actorId: string;
  decision: PromotionDecision;
};

type PromotionEvidenceWriteResult = {
  request: PromotionRequestInsert;
  decision: PromotionDecisionInsert;
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

async function selectExistingDecision(
  client: AdminClient,
  promotionRequestId: string,
): Promise<
  QueryResult<
    Pick<
      PromotionDecisionInsert,
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

function assertSameRequest(existing: PromotionRequestInsert, incoming: PromotionRequestInsert) {
  const keys = Object.keys(incoming) as Array<keyof PromotionRequestInsert>;
  for (const key of keys) {
    if (existing[key] !== incoming[key]) {
      throw new Error("promotion_request_conflict");
    }
  }
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

  const decisionInsert: PromotionDecisionInsert = {
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

  const existingDecisionResult = await selectExistingDecision(admin, input.request.promotion_request_id);
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
