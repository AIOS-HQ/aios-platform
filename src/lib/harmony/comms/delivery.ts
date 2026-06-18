import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { getAdapter } from "@/lib/harmony/comms/adapters";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Channel, Conversation } from "@/types/database";

type DeliveryStatus = "sent" | "failed";

type LinkedInConnection = {
  access_token: string | null;
};

function getLinkedInAuthor(channel: Channel): string | null {
  const raw =
    channel.handle ||
    process.env.LINKEDIN_ORGANIZATION_URN ||
    process.env.LINKEDIN_ORGANIZATION_ID ||
    "";

  const value = raw.trim();

  if (/^urn:li:organization:\d+$/.test(value)) return value;
  if (/^\d+$/.test(value)) return `urn:li:organization:${value}`;

  return null;
}

async function publishLinkedInPost(
  userId: string,
  channel: Channel,
  body: string,
): Promise<DeliveryStatus> {
  const admin = createAdminClient();

  if (!admin) {
    console.error("[comms/linkedin] Supabase admin client unavailable");
    return "failed";
  }

  const author = getLinkedInAuthor(channel);

  if (!author) {
    console.error("[comms/linkedin] Missing LinkedIn organization id or URN");
    return "failed";
  }

  const { data, error } = await admin
    .from("integration_connections")
    .select("access_token")
    .eq("user_id", userId)
    .or("provider.eq.linkedin,provider_id.eq.linkedin")
    .eq("status", "connected")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comms/linkedin] token lookup failed", error.message);
    return "failed";
  }

  const connection = data as LinkedInConnection | null;

  if (!connection?.access_token) {
    console.error("[comms/linkedin] no LinkedIn access token found");
    return "failed";
  }

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202604",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      commentary: body,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[comms/linkedin] publish failed",
      response.status,
      detail.slice(0, 500),
    );
    return "failed";
  }

  return "sent";
}

export async function deliver(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  channel: Channel | null,
  conversation: Conversation,
  body: string,
): Promise<void> {
  const tcm = await getTranslations("os.comms");
  let status: DeliveryStatus = "sent";

  if (channel?.kind === "linkedin") {
    status = await publishLinkedInPost(userId, channel, body);
  } else if (channel) {
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

  await deliver(
    supabase,
    userId,
    msg.id,
    chData as Channel | null,
    conversation,
    msg.body,
  );

  return true;
}

