import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { approveApproval, rejectApproval, getApprovalPayload, getApprovalById } from "@/lib/harmony/autonomy/data-access";
import {
  resumeApprovedExecution,
  recordRejectedExecution,
} from "@/lib/harmony/autonomy/execution-resumption";
import { eventForReference, publishAiosEventBestEffort } from "@/lib/event-mesh/publish";

export const runtime = "nodejs";

function tracePhase(input: {
  phase: string;
  correlationId: string;
  approvalId?: string;
  executionId?: string;
  userId?: string;
  companyId?: string | null;
  agent?: string;
  action?: string;
  approvalStatus?: string;
  executionStatus?: string;
  requiredApproval?: boolean;
  selectedPath?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
}) {
  console.info("[approval-route]", {
    correlation_id: input.correlationId,
    phase: input.phase,
    approval_id: input.approvalId,
    execution_id: input.executionId,
    user_id: input.userId,
    company_id: input.companyId,
    agent: input.agent,
    action: input.action,
    approval_status: input.approvalStatus,
    execution_status: input.executionStatus,
    required_approval: input.requiredApproval,
    selected_path: input.selectedPath,
    error_code: input.errorCode,
    error_name: input.errorName,
    error_message: input.errorMessage,
    timestamp: new Date().toISOString(),
  });
}

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
  const correlationId = `approve_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  tracePhase({ phase: "approval_route_entered", correlationId, selectedPath: "approve_route" });

  const user = await getCurrentUser();
  if (!user) {
    tracePhase({ phase: "approval_resume_failed", correlationId, errorCode: "unauthorized" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    approval_id?: string;
    decision?: string;
    reason?: string;
  } | null;
  if (!body) {
    tracePhase({ phase: "approval_resume_failed", correlationId, userId: user.id, errorCode: "invalid_json" });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const approvalId = String(body.approval_id ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  if (!approvalId) {
    tracePhase({ phase: "approval_resume_failed", correlationId, userId: user.id, errorCode: "missing_approval_id" });
    return NextResponse.json({ error: "missing_approval_id" }, { status: 400 });
  }

  const payload = await getApprovalPayload(user.id, approvalId);
  if (!payload) {
    const existing = await getApprovalById(user.id, approvalId);
    if (decision === "approve" && existing?.status === "approved") {
      tracePhase({
        phase: "approval_response_returned",
        correlationId,
        approvalId,
        userId: user.id,
        approvalStatus: existing.status,
        selectedPath: "idempotent_already_approved",
      });
      return NextResponse.json({ ok: true, status: "already_approved", approval_id: approvalId }, { status: 200 });
    }
    tracePhase({ phase: "approval_resume_failed", correlationId, approvalId, userId: user.id, errorCode: "not_found" });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  tracePhase({
    phase: "approval_payload_loaded",
    correlationId,
    approvalId,
    userId: user.id,
    agent: payload.original_agent,
    action: payload.original_action,
    selectedPath: decision,
  });

  const companyId = await resolvePrimaryCompanyId();

  if (decision === "approve") {
    const approved = await approveApproval(user.id, approvalId);
    if (!approved) {
      tracePhase({ phase: "approval_resume_failed", correlationId, approvalId, userId: user.id, errorCode: "not_found" });
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    tracePhase({
      phase: "approval_decision_persisted",
      correlationId,
      approvalId,
      userId: user.id,
      companyId,
      approvalStatus: "approved",
      selectedPath: "approve",
    });

    // Resume while still pending; mark approved only if the runtime confirms.
    tracePhase({ phase: "approval_resume_started", correlationId, approvalId, userId: user.id, companyId });
    const resume = await resumeApprovedExecution(user.id, approvalId, companyId);
    tracePhase({
      phase: resume.ok ? "execution_dispatch_completed" : "execution_dispatch_blocked",
      correlationId,
      approvalId,
      userId: user.id,
      companyId,
      executionStatus: resume.execution_result?.status,
      requiredApproval: resume.execution_result?.required_approval,
      executionId: resume.execution_result?.execution_id,
      errorMessage: resume.error,
      selectedPath: "approve_resume",
    });
    if (!resume.ok) {
      const blocked = resume.execution_result?.status === "blocked" || resume.execution_result?.status === "failed";
      tracePhase({
        phase: "approval_response_returned",
        correlationId,
        approvalId,
        userId: user.id,
        companyId,
        executionStatus: resume.execution_result?.status,
        requiredApproval: resume.execution_result?.required_approval,
        selectedPath: blocked ? "approved_blocked" : "approve_failed",
      });
      return NextResponse.json(
        {
          ok: true,
          status: blocked ? "approved_blocked" : "approved_failed",
          error: resume.error === "approval_not_found_or_not_approved" ? "approval_revoked" : (resume.error ?? "resume_failed"),
          execution_result: resume.execution_result,
        },
        { status: resume.error === "approval_not_found_or_not_approved" ? 409 : (blocked ? 202 : 500) },
      );
    }
    await publishAiosEventBestEffort(eventForReference({
      eventType: "approval.resolved",
      userId: user.id,
      companyId,
      sourceAgent: payload.original_agent,
      risk: payload.original_action.includes("delete") || payload.original_action.includes("merge") ? "destructive" : "approval",
      priority: "high",
      taskRef: { type: "approval", id: approvalId },
      approvalId,
      payload: {
        status: "approved",
        resumed: true,
        originalAction: payload.original_action,
      },
      context: { traceSource: "approval_route" },
    }));
    tracePhase({
      phase: "approval_response_returned",
      correlationId,
      approvalId,
      userId: user.id,
      companyId,
      executionStatus: resume.execution_result?.status,
      requiredApproval: resume.execution_result?.required_approval,
      selectedPath: "approved_resumed",
    });
    return NextResponse.json({ ok: true, status: "approved", execution_result: resume.execution_result });
  }

  if (decision === "reject") {
    const reason = String(body.reason ?? "Founder rejected").trim();
    const ok = await rejectApproval(user.id, approvalId, reason);
    if (!ok) {
      tracePhase({ phase: "approval_resume_failed", correlationId, approvalId, userId: user.id, errorCode: "not_found" });
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await recordRejectedExecution(user.id, payload, reason, companyId);
    await publishAiosEventBestEffort(eventForReference({
      eventType: "approval.resolved",
      userId: user.id,
      companyId,
      sourceAgent: payload.original_agent,
      risk: "approval",
      priority: "high",
      taskRef: { type: "approval", id: approvalId },
      approvalId,
      payload: {
        status: "rejected",
        reason: reason.slice(0, 500),
      },
      context: { traceSource: "approval_route" },
    }));
    tracePhase({
      phase: "approval_response_returned",
      correlationId,
      approvalId,
      userId: user.id,
      companyId,
      approvalStatus: "rejected",
      selectedPath: "reject",
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  tracePhase({ phase: "approval_resume_failed", correlationId, approvalId, userId: user.id, errorCode: "invalid_decision" });
  return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
}
