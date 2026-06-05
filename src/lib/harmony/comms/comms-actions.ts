"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { canUseDiagnostics } from "@/lib/auth/roles";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { clampAutonomy, requiresApproval } from "@/lib/harmony/os/autonomy";
import { getAdapter } from "@/lib/harmony/comms/adapters";
import { CHANNEL_KINDS } from "@/lib/harmony/comms/catalog";
import type { ActionState } from "@/lib/types";
import type {
  Channel,
  ChannelKind,
  Conversation,
  ConversationStatus,
} from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}
function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}
function revalidateComms(conversationId?: string) {
  revalidatePath("/harmony");
  revalidatePath("/harmony/comms");
  revalidatePath("/harmony/activity");
  if (conversationId) revalidatePath(`/harmony/comms/${conversationId}`);
}

/** Effective send autonomy for a channel: channel level, else its department's. */
async function channelAutonomy(
  supabase: SupabaseClient,
  channel: Channel,
): Promise<0 | 1 | 2 | 3 | 4> {
  if (channel.autonomy_level != null) return clampAutonomy(channel.autonomy_level);
  if (channel.department_id) {
    const { data } = await supabase
      .from("departments")
      .select("autonomy_level")
      .eq("id", channel.department_id)
      .maybeSingle();
    const dept = data as { autonomy_level: number } | null;
    if (dept) return clampAutonomy(dept.autonomy_level ?? 0);
  }
  return 0;
}

// --- Channels --------------------------------------------------------------

export async function createChannel(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const tcm = await getTranslations("os.comms");
  const user = await requireUser();
  const kindRaw = String(formData.get("kind") ?? "") as ChannelKind;
  const kind = CHANNEL_KINDS.includes(kindRaw) ? kindRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  if (!kind) return { status: "error", message: t("errors.generic") };
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .insert({
      user_id: user.id,
      company_id: refOrNull(formData.get("company_id")),
      department_id: refOrNull(formData.get("department_id")),
      kind,
      name,
      handle: orNull(formData.get("handle")),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[comms] createChannel", error);
    return { status: "error", message: t("errors.generic") };
  }

  await emitActivity({
    userId: user.id,
    companyId: refOrNull(formData.get("company_id")),
    kind: "department_action",
    summary: tcm("activity.channelAdded", { name }),
    refType: "channel",
    refId: (data as { id: string }).id,
  });
  revalidateComms();
  return { status: "success", message: t("saved") };
}

/** Connect / disconnect a channel (mock — flips status; no secrets stored). */
export async function setChannelConnected(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const connected = String(formData.get("connected") ?? "") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("channels")
    .update({ status: connected ? "connected" : "disconnected" })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateComms();
}

export async function deleteChannel(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("channels").delete().eq("id", id).eq("user_id", user.id);
  revalidateComms();
}

// --- Conversations ---------------------------------------------------------

export async function createConversation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const channelId = String(formData.get("channel_id") ?? "");
  const contact = String(formData.get("contact") ?? "").trim();
  const subject = orNull(formData.get("subject"));
  if (!channelId) return { status: "error", message: t("errors.generic") };
  if (!contact) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[contact, LIMITS.name], [subject, LIMITS.title]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { data: ch } = await supabase
    .from("channels")
    .select("company_id")
    .eq("id", channelId)
    .maybeSingle();
  const { error } = await supabase.from("conversations").insert({
    user_id: user.id,
    channel_id: channelId,
    company_id: (ch as { company_id: string | null } | null)?.company_id ?? null,
    contact,
    subject,
    last_message_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[comms] createConversation", error);
    return { status: "error", message: t("errors.generic") };
  }
  revalidateComms();
  return { status: "success", message: t("saved") };
}

export async function setConversationStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ConversationStatus;
  const allowed: ConversationStatus[] = ["open", "pending", "snoozed", "closed"];
  if (!id || !allowed.includes(status)) return;
  const supabase = await createClient();
  await supabase
    .from("conversations")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateComms(id);
}

export async function assignConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("conversations")
    .update({ assigned_agent_id: refOrNull(formData.get("agent_id")) })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateComms(id);
}

// --- Messages --------------------------------------------------------------

/** Outbound reply. Autonomy-gated: below Autonomous it queues for approval. */
export async function sendMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const tcm = await getTranslations("os.comms");
  const user = await requireUser();
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId) return { status: "error", message: t("errors.generic") };
  if (!body) return { status: "error", message: t("errors.generic") };
  if (exceedsLimits([[body, LIMITS.noteContent]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { data: convData } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const conversation = convData as Conversation | null;
  if (!conversation) return { status: "error", message: t("errors.generic") };

  const { data: chData } = await supabase
    .from("channels")
    .select("*")
    .eq("id", conversation.channel_id)
    .maybeSingle();
  const channel = chData as Channel | null;
  const level = channel ? await channelAutonomy(supabase, channel) : 0;
  const gated = requiresApproval(level);

  const { data: msgData, error } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      conversation_id: conversationId,
      direction: "outbound",
      body,
      status: gated ? "awaiting_approval" : "queued",
    })
    .select("id")
    .single();
  if (error || !msgData) {
    console.error("[comms] sendMessage", error);
    return { status: "error", message: t("errors.generic") };
  }

  if (!gated) {
    await deliver(supabase, user.id, (msgData as { id: string }).id, channel, conversation, body);
  } else {
    await emitActivity({
      userId: user.id,
      companyId: conversation.company_id,
      kind: "approval",
      summary: tcm("activity.replyQueued", { contact: conversation.contact }),
      refType: "message",
      refId: (msgData as { id: string }).id,
    });
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), status: "open" })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  revalidateComms(conversationId);
  return {
    status: "success",
    message: gated ? tcm("queuedForApproval") : tcm("sent"),
  };
}

/** Approve a queued/awaiting outbound message → deliver it. */
export async function approveMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data: msgData } = await supabase
    .from("messages")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const msg = msgData as
    | { id: string; conversation_id: string; body: string }
    | null;
  if (!msg) return;
  const { data: convData } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  const conversation = convData as Conversation | null;
  if (!conversation) return;
  const { data: chData } = await supabase
    .from("channels")
    .select("*")
    .eq("id", conversation.channel_id)
    .maybeSingle();
  await deliver(supabase, user.id, msg.id, chData as Channel | null, conversation, msg.body);
  revalidateComms(msg.conversation_id);
}

/** Simulate an inbound message (for testing routing without live channels). */
export async function simulateInbound(formData: FormData): Promise<void> {
  const user = await requireUser();
  // Production-safety: this is a test affordance. No-op in production unless the
  // caller is an admin (dev/preview keep it available for everyone).
  if (!(await canUseDiagnostics())) return;
  const conversationId = String(formData.get("conversation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId || !body) return;
  const supabase = await createClient();
  const { data: convData } = await supabase
    .from("conversations")
    .select("contact, company_id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const conv = convData as { contact: string; company_id: string | null } | null;
  if (!conv) return;
  await supabase.from("messages").insert({
    user_id: user.id,
    conversation_id: conversationId,
    direction: "inbound",
    body: body.slice(0, LIMITS.noteContent),
    status: "received",
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), status: "open" })
    .eq("id", conversationId)
    .eq("user_id", user.id);
  const tcm = await getTranslations("os.comms");
  await emitActivity({
    userId: user.id,
    companyId: conv.company_id,
    kind: "agent_action",
    summary: tcm("activity.received", { contact: conv.contact }),
    refType: "conversation",
    refId: conversationId,
  });
  revalidateComms(conversationId);
}

/** Deliver an outbound message via the channel's adapter (mock for now). */
async function deliver(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  channel: Channel | null,
  conversation: Conversation,
  body: string,
): Promise<void> {
  const tcm = await getTranslations("os.comms");
  let status: "sent" | "failed" = "sent";
  if (channel) {
    const result = await getAdapter(channel.kind).send(conversation.contact, body);
    status = result.status;
  }
  await supabase
    .from("messages")
    .update({ status })
    .eq("id", messageId)
    .eq("user_id", userId);
  await emitActivity({
    userId,
    companyId: conversation.company_id,
    kind: "agent_action",
    summary:
      status === "sent"
        ? tcm("activity.sent", { contact: conversation.contact })
        : tcm("activity.failed", { contact: conversation.contact }),
    refType: "message",
    refId: messageId,
  });
}
