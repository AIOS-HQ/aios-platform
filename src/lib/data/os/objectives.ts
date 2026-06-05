import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Objective, ObjectiveStatus } from "@/types/database";

/** List objectives, optionally scoped to a company and/or status. */
export async function listObjectives(opts?: {
  companyId?: string;
  status?: ObjectiveStatus;
}): Promise<Objective[]> {
  const supabase = await createClient();
  let q = supabase.from("objectives").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) console.error("[data/os/objectives] listObjectives", error);
  return (data as Objective[] | null) ?? [];
}

export async function getObjective(id: string): Promise<Objective | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/os/objectives] getObjective", error);
  return (data as Objective | null) ?? null;
}
