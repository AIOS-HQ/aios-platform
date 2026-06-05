import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

/** List projects, optionally scoped to a company and/or objective. */
export async function listProjects(opts?: {
  companyId?: string;
  objectiveId?: string;
}): Promise<Project[]> {
  const supabase = await createClient();
  let q = supabase.from("projects").select("*");
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.objectiveId) q = q.eq("objective_id", opts.objectiveId);
  const { data, error } = await q
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) console.error("[data/os/projects] listProjects", error);
  return (data as Project[] | null) ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/os/projects] getProject", error);
  return (data as Project | null) ?? null;
}
