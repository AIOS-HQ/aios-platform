import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { getAdapter } from "@/lib/harmony/comms/adapters";
import {
  preflightLinkedInPublisher,
  redactLinkedInDiagnostics,
} from "@/lib/integrations/linkedin-publisher";
import type { Channel, Conversation } from "@/types/database";

type DeliveryStatus = "sent" | "failed";

/**
 * Publish to a LinkedIn organization (company) Page.
 *
 * IMPORTANT — app separation:
 *  - The "Harmony" LinkedIn app owns SIGN-IN only (OpenID Connect; scopes
 *    openid/profile/email). Its connector token CANNOT publish — using it to
 *    post produced the historical 403 failures.
 *  - Organization publishing is owned by the "AIOS Publisher" app (Community
 *    Management API + w_organization_social, with the company association).
 *
 * So we authenticate the post with the AIOS Publisher app's organization access
 * token, supplied via env (LINKEDIN_PUBLISHER_ACCESS_TOKEN) — never the Harmony
 * sign-in connector token. The org to post as is the approved env organization;
 * channel handles are allowed only when they match that approved organization.
 */
async function publishLinkedInPost(
  channel: Channel,
  body: string,
): Promise<DeliveryStatus> {
  const preflight = await preflightLinkedInPublisher(channel.handle);
  const author = preflight.author;

  if (!preflight.ok || !author) {
    console.error(
      "[comms/linkedin] publish ABORTED before request",
      `organization=${author ?? "unresolved"}`,
      `apiVersion=${preflight.apiVersion}`,
      `issues=${preflight.health.issues.map((i) => i.code).join(",") || "none"}`,
    );
    return "failed";
  }

  const accessToken = process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN;

  if (!accessToken) {
    console.error(
      "[comms/linkedin] publish ABORTED before request: LINKEDIN_PUBLISHER_ACCESS_TOKEN " +
        "is not set — organization publishing requires the AIOS Publisher app token " +
        "(Community Management API, w_organization_social), not the Harmony sign-in connector",
    );
    return "failed";
  }

  // Always log the publish attempt BEFORE the request so it is visible in the
  // function logs even when LinkedIn later rejects it. If you do NOT see this
  // line after Approve & Send, the publish path was never reached.
  console.info(
    `[comms/linkedin] publishing as ${author} apiVersion=${preflight.apiVersion} (${body.length} chars) → POST https://api.linkedin.com/rest/posts`,
  );

  try {
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": preflight.apiVersion,
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
      // Capture the exact LinkedIn diagnostics for the failure log.
      console.error(
        "[comms/linkedin] publish failed",
        response.status,
        response.headers.get("x-linkedin-error-code") || "",
        response.headers.get("x-li-uuid") || "",
        redactLinkedInDiagnostics(detail).slice(0, 500),
      );
      return "failed";
    }

    console.info("[comms/linkedin] publish OK", response.status);
    return "sent";
  } catch (err) {
    console.error(
      "[comms/linkedin] publish threw",
      err instanceof Error ? err.message : String(err),
    );
    return "failed";
  }
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
    status = await publishLinkedInPost(channel, body);
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
