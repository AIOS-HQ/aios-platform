import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { approveApproval, rejectApproval, getApprovalPayload } from "@/lib/harmony/autonomy/data-access";
import {
  resumeApprovedExecution,
  recordRejectedExecution,
} from "@/lib/harmony/autonomy/execution-resumption";

export const runtime = "nodejs";

/**
 * Approve / reject a pending autonomy approval and drive the execution spine.
 *
 * POST { approval_id, decision: "approve" | "reject", reason? }
 *  - approve → resume the exact saved execution; mark approved only on success.
 *  - reject  → mark the payload rejected and record a blocked execution result.
 *
 * Owner-scoped via the authenticated Founder + RLS on approval_payloads.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    approval_id?: string;
    decision?: string;
    reason?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const approvalId = String(body.approval_id ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  if (!approvalId) {
    return NextResponse.json({ error: "missing_approval_id" }, { status: 400 });
  }

  const payload = await getApprovalPayload(user.id, approvalId);
  if (!payload) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const companyId = await resolvePrimaryCompanyId();

  if (decision === "approve") {
    // Resume while still pending; mark approved only if the runtime confirms.
    const resume = await resumeApprovedExecution(user.id, approvalId, companyId);
    if (!resume.ok) {
      return NextResponse.json(
        { error: resume.error ?? "resume_failed", execution_result: resume.execution_result },
        { status: 400 },
      );
    }
    await approveApproval(user.id, approvalId);
    return NextResponse.json({ ok: true, status: "approved", execution_result: resume.execution_result });
  }

  if (decision === "reject") {
    const reason = String(body.reason ?? "Founder rejected").trim();
    const ok = await rejectApproval(user.id, approvalId, reason);
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await recordRejectedExecution(user.id, payload, reason, companyId);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
}
