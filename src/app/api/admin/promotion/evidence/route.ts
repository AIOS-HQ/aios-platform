import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { writeFounderPromotionEvidence } from "@/lib/promotion/evidence-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromotionDecision = "approved" | "rejected";

type PromotionEvidenceBody = {
  decision: PromotionDecision;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function derivePromotionRequestId(body: Omit<PromotionEvidenceBody, "decision">): string {
  const tuple = [
    body.repository,
    body.purpose,
    body.target_sha,
    body.source_environment,
    body.target_environment,
    body.runtime_evidence_id ?? "",
    body.runtime_artifact_id ?? "",
    body.migration_evidence_id,
    body.migration_artifact_id,
    body.preview_certification_waiver ? "true" : "false",
    body.preview_certification_waiver_reason ?? "",
  ];

  return `promotion-request:${createHash("sha256").update(tuple.join("|"), "utf8").digest("hex")}`;
}

function parseBody(input: unknown): PromotionEvidenceBody | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;

  const decision = body.decision;
  const repository = body.repository;
  const purpose = body.purpose;
  const targetSha = body.target_sha;
  const sourceEnvironment = body.source_environment;
  const targetEnvironment = body.target_environment;
  const runtimeEvidenceId = body.runtime_evidence_id;
  const runtimeArtifactId = body.runtime_artifact_id;
  const migrationEvidenceId = body.migration_evidence_id;
  const migrationArtifactId = body.migration_artifact_id;
  const previewCertificationWaiver = body.preview_certification_waiver;
  const previewCertificationWaiverReason = body.preview_certification_waiver_reason;

  if (decision !== "approved" && decision !== "rejected") return null;
  if (!isNonEmptyString(repository)) return null;
  if (!isNonEmptyString(purpose)) return null;
  if (!isNonEmptyString(targetSha)) return null;
  if (!isNonEmptyString(sourceEnvironment)) return null;
  if (!isNonEmptyString(targetEnvironment)) return null;
  if (!isNonEmptyString(migrationEvidenceId)) return null;
  if (!isNonEmptyString(migrationArtifactId)) return null;
  if (typeof previewCertificationWaiver !== "boolean") return null;

  if (previewCertificationWaiver === false) {
    if (!isNonEmptyString(runtimeEvidenceId)) return null;
    if (!isNonEmptyString(runtimeArtifactId)) return null;
    if (previewCertificationWaiverReason !== null) return null;
  } else {
    if (runtimeEvidenceId !== null) return null;
    if (runtimeArtifactId !== null) return null;
    if (previewCertificationWaiverReason !== "preview_certification_contract_incompatibility") return null;
  }

  return {
    decision,
    repository,
    purpose,
    target_sha: targetSha,
    source_environment: sourceEnvironment,
    target_environment: targetEnvironment,
    runtime_evidence_id: runtimeEvidenceId,
    runtime_artifact_id: runtimeArtifactId,
    migration_evidence_id: migrationEvidenceId,
    migration_artifact_id: migrationArtifactId,
    preview_certification_waiver: previewCertificationWaiver,
    preview_certification_waiver_reason: previewCertificationWaiverReason,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const body = parseBody(payload);
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    const promotionRequestId = derivePromotionRequestId(body);

    const result = await writeFounderPromotionEvidence({
      request: {
        promotion_request_id: promotionRequestId,
        repository: body.repository,
        purpose: body.purpose,
        target_sha: body.target_sha,
        source_environment: body.source_environment,
        target_environment: body.target_environment,
        runtime_evidence_id: body.runtime_evidence_id,
        runtime_artifact_id: body.runtime_artifact_id,
        migration_evidence_id: body.migration_evidence_id,
        migration_artifact_id: body.migration_artifact_id,
        preview_certification_waiver: body.preview_certification_waiver,
        preview_certification_waiver_reason: body.preview_certification_waiver_reason,
        created_by: user.id,
      },
      actorId: user.id,
      decision: body.decision,
    });

    return NextResponse.json({
      ok: true,
      decision: {
        promotion_request_id: result.request.promotion_request_id,
        decision_source: result.decision.decision_source,
        decision: result.decision.decision,
        actor_type: result.decision.actor_type,
        actor_id: result.decision.actor_id,
        evidence_id: result.decision.evidence_id,
        decided_at: result.decision.decided_at,
        approved_at: result.decision.approved_at,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "write_failed" }, { status: 400 });
  }
}
