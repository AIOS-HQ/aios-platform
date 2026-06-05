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
  revalidatePath("/harmony/approvals");
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
    .select("title, company_id, work_item_id, message_id")
    .maybeSingle();
  if (error) {
    console.error("[approval-actions] decideApproval", error);
    return;
  }

  const row = data as {
    title: string;
    company_id: string | null;
    work_item_id: string | null;
    message_id: string | null;
  } | null;

  // Approving a gated work item runs it (forced past the autonomy gate).
  if (decision === "approved" && row?.work_item_id) {
    const { data: wi } = await supabase
      .from("work_items")
      .select("*")
      .eq("id", row.work_item_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (wi) await executeWorkItem(supabase, user.id, wi as WorkItem, { force: true });
  }

  // Approving/rejecting a gated communications message delivers or cancels it
  // (D4 — same effect as approving from the conversation thread).
  if (row?.message_id) {
    if (decision === "approved") {
      await deliverMessageById(supabase, user.id, row.message_id);
    } else {
      await supabase
        .from("messages")
        .update({ status: "failed" })
        .eq("id", row.message_id)
        .eq("user_id", user.id);
    }
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
