import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/types/database";

export async function listChannels(): Promise<Channel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) console.error("[data/comms/channels] listChannels", error);
  return (data as Channel[] | null) ?? [];
}

export async function getChannel(id: string): Promise<Channel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/comms/channels] getChannel", error);
  return (data as Channel | null) ?? null;
}
