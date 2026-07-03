/**
 * Unified Autonomy Policy Engine — Server actions for Founder interactions.
 *
 * Handlers for:
 *  - Creating/revoking Founder directives
 *  - Approving/rejecting pending actions
 *  - Querying approval status
 *
 * All actions are Founder-only and audited.
 */

import "server-only";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { emitActivity } from "@/lib/harmony/os/events";
import type { ActionState } from "@/lib/types";
import type {
  AutonomyAgent,
  AutonomyDomain,
  ActionType,
  FounderDirective,
} from "./types";
import {
  createFounderDirective,
  revokeDirective,
  approveApproval,
  rejectApproval,
  getApprovalPayload,
} from "./data-access";
import { resumeApprovedExecution, recordRejectedExecution } from "./execution-resumption";

/**
 * Server action: Founder creates a new directive.
 */
export async function createDirectiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("autonomy");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const agent = String(formData.get("agent") ?? "").trim() as AutonomyAgent;
  const domain = String(formData.get("domain") ?? "").trim() as AutonomyDomain;
  const allowedActionsRaw = String(formData.get("allowed_actions") ?? "");
  const allowedActions = allowedActionsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s) as ActionType[];

  if (!agent || !domain || allowedActions.length === 0) {
    return { status: "error", message: t("errors.invalidDirective") };
  }

  const directive = await createFounderDirective(user.id, companyId, {
    agent,
    domain,
    allowed_actions: allowedActions,
    denied_actions: [],
    status: "active",
    granted_at: new Date().toISOString(),
  });

  if (!directive) {
    return { status: "error", message: t("errors.generic") };
  }

  // Emit activity
  await emitActivity({
    userId: user.id,
    companyId,
    actorType: "founder",
    actorId: user.id,
    kind: "system",
    summary: `Founder authorized ${agent} to ${allowedActions.join(", ")} in ${domain}.`,
    refType: "directive",
    refId: directive.id,
  });

  revalidatePath("/harmony/autonomy");
  revalidatePath("/harmony/review");

  return { status: "success", message: "" };
}

/**
 * Server action: Founder revokes a directive.
 */
export async function revokeDirectiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("autonomy");
  const user = await requireUser();

  const directiveId = String(formData.get("directive_id") ?? "").trim();
  if (!directiveId) {
    return { status: "error", message: t("errors.generic") };
  }

  const ok = await revokeDirective(user.id, directiveId);
  if (!ok) {
    return { status: "error", message: t("errors.generic") };
  }

  // Emit activity
  const companyId = await resolvePrimaryCompanyId();
  await emitActivity({
    userId: user.id,
    companyId,
    actorType: "founder",
    actorId: user.id,
    kind: "system",
    summary: `Founder revoked directive ${directiveId}.`,
    refType: "directive",
    refId: directiveId,
  });

  revalidatePath("/harmony/autonomy");
  revalidatePath("/harmony/review");

  return { status: "success", message: "" };
}

/**
 * Server action: Founder approves a pending action.
 */
export async function approveActionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("autonomy");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const approvalId = String(formData.get("approval_id") ?? "").trim();
  if (!approvalId) {
    return { status: "error", message: t("errors.generic") };
  }

  // Verify payload exists
  const payload = await getApprovalPayload(user.id, approvalId);
  if (!payload) {
    return { status: "error", message: t("errors.approvalNotFound") };
  }

  // Resume the exact saved execution while the payload is still pending; mark it
  // approved only once the runtime confirms the action ran, so a failed resume
  // stays retryable in the Review Queue.
  const resume = await resumeApprovedExecution(user.id, approvalId, companyId);
  if (resume.ok) {
    await approveApproval(user.id, approvalId);
  }

  await emitActivity({
    userId: user.id,
    companyId,
    actorType: "founder",
    actorId: user.id,
    kind: "approval",
    summary: resume.ok
      ? `Founder approved ${payload.original_agent} to ${payload.original_action}; execution resumed.`
      : `Founder approved ${payload.original_agent} to ${payload.original_action}, but resume failed: ${resume.error ?? "unknown"}.`,
    refType: "approval",
    refId: approvalId,
  });

  revalidatePath("/harmony/review");
  revalidatePath("/harmony/approvals");

  if (!resume.ok) {
    return { status: "error", message: t("errors.generic") };
  }

  return { status: "success", message: "" };
}

/**
 * Server action: Founder rejects a pending action.
 */
export async function rejectActionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("autonomy");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const approvalId = String(formData.get("approval_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!approvalId) {
    return { status: "error", message: t("errors.generic") };
  }

  // Verify payload exists
  const payload = await getApprovalPayload(user.id, approvalId);
  if (!payload) {
    return { status: "error", message: t("errors.approvalNotFound") };
  }

  const ok = await rejectApproval(user.id, approvalId, reason);
  if (!ok) {
    return { status: "error", message: t("errors.generic") };
  }

  // Block the execution with the Founder's reason (audited in execution_results).
  await recordRejectedExecution(user.id, payload, reason, companyId);

  // Emit activity
  await emitActivity({
    userId: user.id,
    companyId,
    actorType: "founder",
    actorId: user.id,
    kind: "approval",
    summary: `Founder rejected ${payload.original_agent} action: ${reason || "No reason provided"}`,
    refType: "approval",
    refId: approvalId,
  });

  revalidatePath("/harmony/review");
  revalidatePath("/harmony/approvals");

  return { status: "success", message: "" };
}
