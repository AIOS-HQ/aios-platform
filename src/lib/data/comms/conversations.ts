import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Conversation, ConversationStatus } from "@/types/database";

export async function listConversations(opts?: {
  status?: ConversationStatus;
  channelId?: string;
}): Promise<Conversation[]> {
  const supabase = await createClient();
  let q = supabase.from("conversations").select("*");
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.channelId) q = q.eq("channel_id", opts.channelId);
  const { data, error } = await q
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) console.error("[data/comms/conversations] listConversations", error);
  return (data as Conversation[] | null) ?? [];
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/comms/conversations] getConversation", error);
  return (data as Conversation | null) ?? null;
}
