"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { executeWorkItem } from "@/lib/harmony/os/execution";
import { deliverMessageById } from "@/lib/harmony/comms/delivery";
import { APPROVAL_TYPES } from "@/lib/harmony/os/catalog";
import type { ActionState } from "@/lib/types";
import type { ApprovalType, TaskPriority, WorkItem } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

function revalidateApprovals() {
  revalidatePath("/harmony");
  revalidatePath("/harmony", "layout");
  revalidatePath("/harmony/approvals");
  revalidatePath("/harmony/work");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown_error";
  }
}

export async function createApproval(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const summary = orNull(formData.get("summary"));
  const typeRaw = String(formData.get("type") ?? "content") as ApprovalType;
  const type = APPROVAL_TYPES.includes(typeRaw) ? typeRaw : "content";
  const riskRaw = String(formData.get("risk") ?? "medium") as TaskPriority;
  const risk = PRIORITIES.includes(riskRaw) ? riskRaw : "medium";
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [summary, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    user_id: user.id,
    company_id: refOrNull(formData.get("company_id")),
    type,
    title,
    summary,
    risk,
  });
  if (error) {
    console.error("[approval-actions] createApproval", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateApprovals();
  return { status: "success", message: t("saved") };
}

/** Approve or reject a pending approval. */
export async function decideApproval(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("title, company_id, work_item_id")
    .maybeSingle();
  if (error) {
    console.error("[approval-actions] decideApproval", error);
    return;
  }

  const row = data as {
    title: string;
    company_id: string | null;
    work_item_id: string | null;
  } | null;

  // Approving a gated work item runs it (forced past the autonomy gate).
  if (decision === "approved" && row?.work_item_id) {
    const { data: wi } = await supabase
      .from("work_items")
      .select("*")
      .eq("id", row.work_item_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wi) {
      const workItem = wi as WorkItem;
      try {
        await executeWorkItem(supabase, user.id, workItem, { force: true });
      } catch (err) {
        const message = errorMessage(err);
        console.error("[approval-actions] executeWorkItem", err);

        await supabase
          .from("work_items")
          .update({
            status: "blocked",
            description: `${workItem.description ?? ""}\n\nApproval execution failed:\n${message}`.slice(
              0,
              LIMITS.noteContent,
            ),
          })
          .eq("id", workItem.id)
          .eq("user_id", user.id);

        await emitActivity({
          userId: user.id,
          companyId: row.company_id ?? workItem.company_id ?? null,
          departmentId: workItem.department_id,
          actorType: "agent",
          actorId: workItem.agent_id ?? "harmony",
          kind: "system",
          summary: `Approval execution failed: ${workItem.title}`,
          refType: "work_item",
          refId: workItem.id,
        });
      }
    }
  }

  // Approving/rejecting a gated communications message delivers or cancels it
  // (D4 — same effect as approving from the conversation thread). The link is
  // read in a separate, error-tolerant query so the decision flow keeps working
  // even before migration 1100 (approvals.message_id) is applied — a message
  // approval can only exist once that column does, so pre-migration this is null.
  const { data: linkRow } = await supabase
    .from("approvals")
    .select("message_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const messageId =
    (linkRow as { message_id: string | null } | null)?.message_id ?? null;
  if (messageId) {
    if (decision === "approved") {
      await deliverMessageById(supabase, user.id, messageId);
    } else {
      await supabase
        .from("messages")
        .update({ status: "failed" })
        .eq("id", messageId)
        .eq("user_id", user.id);
    }
  }

  // A2A: approving/rejecting a gated agent-to-agent delegation makes it
  // actionable (delegated) or blocks it. Separate, error-tolerant query so it is
  // a no-op until the agent_messages migration (which adds approvals
  // .agent_message_id) is applied.
  const { data: amLink } = await supabase
    .from("approvals")
    .select("agent_message_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const agentMessageId =
    (amLink as { agent_message_id: string | null } | null)?.agent_message_id ??
    null;
  if (agentMessageId) {
    await supabase
      .from("agent_messages")
      .update({ status: decision === "approved" ? "delegated" : "blocked" })
      .eq("id", agentMessageId)
      .eq("user_id", user.id);
  }

  const to = await getTranslations("os");
  await emitActivity({
    userId: user.id,
    companyId: row?.company_id ?? null,
    kind: "approval",
    summary: to(
      decision === "approved"
        ? "activity.approvalApproved"
        : "activity.approvalRejected",
      { title: row?.title ?? "" },
    ),
    refType: "approval",
    refId: id,
  });

  revalidateApprovals();
}

export async function deleteApproval(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("approvals").delete().eq("id", id).eq("user_id", user.id);
  revalidateApprovals();
}
