import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Department } from "@/types/database";

/** List departments, optionally scoped to one company. */
export async function listDepartments(
  companyId?: string,
): Promise<Department[]> {
  const supabase = await createClient();
  let q = supabase.from("departments").select("*");
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) console.error("[data/os/departments] listDepartments", error);
  return (data as Department[] | null) ?? [];
}

export async function getDepartment(id: string): Promise<Department | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/os/departments] getDepartment", error);
  return (data as Department | null) ?? null;
}
