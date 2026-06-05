"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { uniqueSlug } from "@/lib/harmony/os/slug";
import { buildStandardDepartmentSeed } from "@/lib/harmony/os/seed";
import { emitActivity } from "@/lib/harmony/os/events";
import { listCompanies } from "@/lib/data/os/companies";
import { DOMAINS } from "@/lib/harmony/os/catalog";
import type { ActionState } from "@/lib/types";
import type { Company, CompanyDomain } from "@/types/database";

/**
 * Create a company and seed its standard departments + agents (Code-first).
 * Single owner — RLS scopes everything to the founder.
 */
export async function createCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const domainRaw = String(formData.get("domain") ?? "business") as CompanyDomain;
  const domain = DOMAINS.includes(domainRaw) ? domainRaw : "business";
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const existing = await listCompanies();
  const slug = uniqueSlug(name, existing.map((c) => c.slug));

  const { data, error } = await supabase
    .from("companies")
    .insert({
      user_id: user.id,
      name,
      slug,
      description,
      domain,
      position: existing.length,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[company-actions] createCompany", error);
    return { status: "error", message: t("errors.generic") };
  }
  const company = data as Company;

  // Seed the standard departments, then their agents.
  const seed = buildStandardDepartmentSeed();
  const { data: deptRows, error: deptErr } = await supabase
    .from("departments")
    .insert(
      seed.map((d) => ({
        user_id: user.id,
        company_id: company.id,
        key: d.key,
        name: d.name,
        description: d.description,
        autonomy_level: d.autonomy_level,
        position: d.position,
      })),
    )
    .select("id, key");
  if (deptErr) console.error("[company-actions] seed departments", deptErr);

  if (deptRows) {
    const idByKey = new Map(
      (deptRows as { id: string; key: string }[]).map((d) => [d.key, d.id]),
    );
    const agentRows = seed.flatMap((d) => {
      const departmentId = idByKey.get(d.key);
      if (!departmentId) return [];
      return d.agents.map((a) => ({
        user_id: user.id,
        department_id: departmentId,
        key: a.key,
        name: a.name,
        role: a.role,
        position: a.position,
      }));
    });
    if (agentRows.length > 0) {
      const { error: agentErr } = await supabase.from("agents").insert(agentRows);
      if (agentErr) console.error("[company-actions] seed agents", agentErr);
    }
  }

  await emitActivity({
    userId: user.id,
    companyId: company.id,
    kind: "system",
    summary: to("activity.companyCreated", { name }),
    refType: "company",
    refId: company.id,
  });

  revalidatePath("/harmony");
  revalidatePath("/harmony/companies");
  return { status: "success", message: t("saved") };
}
