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
