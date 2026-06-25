"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { deliverMessageById } from "@/lib/harmony/comms/delivery";
import { juliusRemember, resolvePrimaryCompanyId } from "@/lib/julius/wiring";

/**
 * Harmony Oversight — owner intervention + teaching actions.
 *
 * These extend the existing comms / approvals / Julius systems; they add no new
 * tables. Every intervention is audited through the SAME path the rest of the
 * platform uses (emitActivity → activity_events), so the owner's actions show
 * up in the activity trail alongside everything else. Reply/approve/reassign
 * reuse the comms primitives; only the genuinely new verbs live here.
 */

export const TEACH_CATEGORIES = [
  "company_policy",
  "communication_preference",
  "customer_service_rule",
  "operational_guideline",
] as const;
export type TeachCategory = (typeof TEACH_CATEGORIES)[number];

function revalidateOversight(conversationId?: string) {
  revalidatePath("/harmony/oversight");
  revalidatePath("/harmony/oversight/conversations");
  revalidatePath("/harmony/comms");
  revalidatePath("/harmony/activity");
  if (conversationId) {
    revalidatePath(`/harmony/oversight/conversations/${conversationId}`);
    revalidatePath(`/harmony/comms/${conversationId}`);
  }
}

async function convInfo(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<{ contact: string; company_id: string | null }> {
  const { data } = await supabase
    .from("conversations")
    .select("contact, company_id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { contact: string; company_id: string | null } | null) ?? {
    contact: "",
    company_id: null,
  };
}

/** Owner replies directly inside the conversation (an explicit takeover send —
 * delivered immediately, bypassing autonomy gating since the owner is acting). */
export async function ownerReply(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) return;
  if (exceedsLimits([[body, LIMITS.noteContent]])) return;

  const supabase = await createClient();
  const conv = await convInfo(supabase, user.id, conversationId);
  const { data: msgData, error } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      conversation_id: conversationId,
      direction: "outbound",
      body,
      status: "queued",
    })
    .select("id")
    .single();
  if (error || !msgData) {
    console.error("[oversight] ownerReply", error);
    return;
  }
  await deliverMessageById(supabase, user.id, (msgData as { id: string }).id);
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), status: "open" })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "system",
    summary: t("activity.replied", { contact: conv.contact }),
    refType: "conversation",
    refId: conversationId,
  });
  revalidateOversight(conversationId);
}

/** Edit a pending (awaiting-approval) outbound response before it is sent. */
export async function editPendingMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
  if (exceedsLimits([[body, LIMITS.noteContent]])) return;

  const supabase = await createClient();
  const { data: msgData } = await supabase
    .from("messages")
    .select("conversation_id, direction, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const msg = msgData as
    | { conversation_id: string; direction: string; status: string }
    | null;
  if (!msg || msg.direction !== "outbound" || msg.status !== "awaiting_approval") return;

  await supabase.from("messages").update({ body }).eq("id", id).eq("user_id", user.id);
  // Keep the linked Approval Center row's summary in sync.
  await supabase
    .from("approvals")
    .update({ summary: body.slice(0, LIMITS.description) })
    .eq("user_id", user.id)
    .eq("message_id", id)
    .eq("status", "pending");

  const conv = await convInfo(supabase, user.id, msg.conversation_id);
  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "system",
    summary: t("activity.editedPending", { contact: conv.contact }),
    refType: "message",
    refId: id,
  });
  revalidateOversight(msg.conversation_id);
}

/** Cancel a pending response — rejects it and resolves the linked approval. */
export async function cancelPendingMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: msgData } = await supabase
    .from("messages")
    .select("conversation_id, direction, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const msg = msgData as
    | { conversation_id: string; direction: string; status: string }
    | null;
  if (!msg || msg.direction !== "outbound" || msg.status !== "awaiting_approval") return;

  await supabase.from("messages").update({ status: "failed" }).eq("id", id).eq("user_id", user.id);
  await supabase
    .from("approvals")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("message_id", id)
    .eq("status", "pending");

  const conv = await convInfo(supabase, user.id, msg.conversation_id);
  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "approval",
    summary: t("activity.cancelledPending", { contact: conv.contact }),
    refType: "message",
    refId: id,
  });
  revalidateOversight(msg.conversation_id);
}

/** Owner takes over a conversation — marks it owner-handled (status pending). */
export async function takeOverConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const conv = await convInfo(supabase, user.id, id);
  await supabase
    .from("conversations")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("user_id", user.id);
  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "system",
    summary: t("activity.tookOver", { contact: conv.contact }),
    refType: "conversation",
    refId: id,
  });
  revalidateOversight(id);
}

/** Hand the conversation back to Harmony (re-open it for normal operation). */
export async function resumeConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const conv = await convInfo(supabase, user.id, id);
  await supabase
    .from("conversations")
    .update({ status: "open" })
    .eq("id", id)
    .eq("user_id", user.id);
  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "system",
    summary: t("activity.resumed", { contact: conv.contact }),
    refType: "conversation",
    refId: id,
  });
  revalidateOversight(id);
}

/** Manually flag a conversation for attention (no escalation table exists yet —
 * marks it pending and writes an audited escalation signal). */
export async function escalateConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const conv = await convInfo(supabase, user.id, id);
  await supabase
    .from("conversations")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("user_id", user.id);
  const t = await getTranslations("oversight");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "approval",
    summary: t("activity.escalated", { contact: conv.contact }),
    refType: "conversation",
    refId: id,
  });
  revalidateOversight(id);
}

/** Teach Harmony a rule. Stored in the single Company Brain (Julius) under the
 * existing `knowledge` kind, classified via refs — no parallel learning store. */
export async function teachHarmony(formData: FormData): Promise<void> {
  const user = await requireUser();
  const instruction = String(formData.get("instruction") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "");
  const category: TeachCategory = (TEACH_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as TeachCategory)
    : "operational_guideline";
  if (!instruction) return;
  if (exceedsLimits([[instruction, LIMITS.noteContent]])) return;

  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) return;

  const t = await getTranslations("oversight");
  const label = t(`teach.category.${category}`);
  await juliusRemember({
    userId: user.id,
    companyId,
    agent: "harmony",
    kind: "knowledge",
    title: label,
    content: instruction,
    importance: 4,
    refs: { kind: "oversight_teaching", category },
  });
  await emitActivity({
    userId: user.id,
    companyId,
    kind: "system",
    summary: t("activity.taught", { category: label }),
    refType: "knowledge",
  });
  revalidateOversight();
}
