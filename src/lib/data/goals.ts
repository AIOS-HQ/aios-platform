import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { GoalStatus, PersonalGoal } from "@/types/database";

/** List the current user's goals. */
export async function listGoals(opts?: {
  status?: GoalStatus | "all";
  limit?: number;
}): Promise<PersonalGoal[]> {
  const supabase = await createClient();
  let query = supabase.from("personal_goals").select("*");
  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 500);
  return (data as PersonalGoal[] | null) ?? [];
}
