import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types/database";

/** List the owner's companies (RLS scopes to the owner). */
export async function listCompanies(): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) console.error("[data/os/companies] listCompanies", error);
  return (data as Company[] | null) ?? [];
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[data/os/companies] getCompany", error);
  return (data as Company | null) ?? null;
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("[data/os/companies] getCompanyBySlug", error);
  return (data as Company | null) ?? null;
}
