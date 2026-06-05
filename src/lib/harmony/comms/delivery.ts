import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { getAdapter } from "@/lib/harmony/comms/adapters";
import type { Channel, Conversation } from "@/types/database";

/**
 * Deliver an outbound message via the channel's adapter (mock for now) and log
 * the outcome to the activity feed. Shared by the conversation thread approve
 * action and the Approval Center decision, so both paths behave identically.
 */
export async function deliver(
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

/**
 * Load a message's conversation + channel and deliver it. Owner-scoped.
 * Returns false if the message/conversation can't be found.
 */
export async function deliverMessageById(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const { data: msgData } = await supabase
    .from("messages")
    .select("id, conversation_id, body")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  const msg = msgData as
    | { id: string; conversation_id: string; body: string }
    | null;
  if (!msg) return false;

  const { data: convData } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", msg.conversation_id)
    .eq("user_id", userId)
    .maybeSingle();
  const conversation = convData as Conversation | null;
  if (!conversation) return false;

  const { data: chData } = await supabase
    .from("channels")
    .select("*")
    .eq("id", conversation.channel_id)
    .maybeSingle();
  await deliver(supabase, userId, msg.id, chData as Channel | null, conversation, msg.body);
  return true;
}
