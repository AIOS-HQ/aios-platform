import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserSettings } from "@/types/database";

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) console.error("[data/profile] getProfile", error);
  return (data as Profile | null) ?? null;
}

export async function getUserSettings(
  userId: string,
): Promise<UserSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) console.error("[data/profile] getUserSettings", error);
  return (data as UserSettings | null) ?? null;
}
