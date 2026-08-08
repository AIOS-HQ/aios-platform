import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { writeFounderPromotionEvidence } from "@/lib/promotion/evidence-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromotionDecision = "approved" | "rejected";

type PromotionEvidenceBody = {
  decision: PromotionDecision;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBody(input: unknown): PromotionEvidenceBody | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;

  if (body.decision !== "approved" && body.decision !== "rejected") return null;

  const required = [
    "promotion_request_id",
    "repository",
    "purpose",
    "target_sha",
    "source_environment",
    "target_environment",
    "runtime_evidence_id",
    "runtime_artifact_id",
    "migration_evidence_id",
    "migration_artifact_id",
  ] as const;

  for (const field of required) {
    if (!isNonEmptyString(body[field])) return null;
  }

  return {
    decision: body.decision,
    promotion_request_id: body.promotion_request_id,
    repository: body.repository,
    purpose: body.purpose,
    target_sha: body.target_sha,
    source_environment: body.source_environment,
    target_environment: body.target_environment,
    runtime_evidence_id: body.runtime_evidence_id,
    runtime_artifact_id: body.runtime_artifact_id,
    migration_evidence_id: body.migration_evidence_id,
    migration_artifact_id: body.migration_artifact_id,
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
    const result = await writeFounderPromotionEvidence({
      request: {
        promotion_request_id: body.promotion_request_id,
        repository: body.repository,
        purpose: body.purpose,
        target_sha: body.target_sha,
        source_environment: body.source_environment,
        target_environment: body.target_environment,
        runtime_evidence_id: body.runtime_evidence_id,
        runtime_artifact_id: body.runtime_artifact_id,
        migration_evidence_id: body.migration_evidence_id,
        migration_artifact_id: body.migration_artifact_id,
        created_by: user.id,
      },
      actorId: user.id,
      decision: body.decision,
    });

    return NextResponse.json({
      ok: true,
      decision: {
        promotion_request_id: result.decision.promotion_request_id,
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
