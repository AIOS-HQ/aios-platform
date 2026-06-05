import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Message } from "@/types/database";

/** Messages in a conversation, oldest first (thread order). */
export async function listMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) console.error("[data/comms/messages] listMessages", error);
  return (data as Message[] | null) ?? [];
}

/**
 * Outbound messages awaiting approval (owner-scoped via RLS). Used by the inbox
 * to show pending-approval indicators (D4).
 */
export async function listAwaitingApprovalMessages(): Promise<
  { id: string; conversation_id: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .eq("direction", "outbound")
    .eq("status", "awaiting_approval");
  if (error)
    console.error("[data/comms/messages] listAwaitingApprovalMessages", error);
  return (data as { id: string; conversation_id: string }[] | null) ?? [];
}
