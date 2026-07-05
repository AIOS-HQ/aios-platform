import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { gmailFetch } from "./client";

/** Gmail: list_messages (read); draft_response/archive_message (routine); send_message (approval). */
interface RawMessageInput { raw: string; }
interface MessageRef { messageId: string; }
function requireToken(t: string | null): string { if (!t) throw new Error("Missing Google access token"); return t; }

let registered = false;
export function registerGmailCapabilities(): void {
  if (registered) return;
  registered = true;
  registerCapabilityHandler("gmail", "list_messages", async ({ accessToken }) =>
    gmailFetch(requireToken(accessToken), { path: "/messages?maxResults=50" }));
  registerCapabilityHandler<RawMessageInput, unknown>("gmail", "draft_response", async ({ accessToken, input }) =>
    gmailFetch(requireToken(accessToken), { method: "POST", path: "/drafts", body: { message: { raw: input.raw } } }));
  registerCapabilityHandler<MessageRef, unknown>("gmail", "archive_message", async ({ accessToken, input }) =>
    gmailFetch(requireToken(accessToken), { method: "POST", path: `/messages/${input.messageId}/modify`, body: { removeLabelIds: ["INBOX"] } }));
  registerCapabilityHandler<RawMessageInput, unknown>("gmail", "send_message", async ({ accessToken, input }) =>
    gmailFetch(requireToken(accessToken), { method: "POST", path: "/messages/send", body: { raw: input.raw } }));
}
