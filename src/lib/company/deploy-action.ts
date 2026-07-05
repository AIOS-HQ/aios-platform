"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/harmony/os/slug";
import { listCompanies } from "@/lib/data/os/companies";
import { emitActivity } from "@/lib/harmony/os/events";
import { templateById } from "@/lib/marketplace/templates";
import { provisionCompanyFromTemplate } from "@/lib/company/enterprise-provisioning";

/**
 * Company Builder — deploy action. Creates the company row, then hands off to the
 * EXISTING Enterprise Auto-Provisioning (`provisionCompanyFromTemplate`) — no
 * duplicated provisioning logic. Owner-scoped (requireUser + RLS). Honors the
 * Builder's tool + department selections via the provisioner's optional
 * overrides. Returns a deployment summary the UI renders as the signature
 * "this company will provision…" experience.
 */

export interface DeploymentResult {
  ok: boolean;
  error?: string;
  companyId?: string;
  companyName?: string;
  industry?: string;
  templateId?: string;
  templateName?: string;
  provisioned?: {
    departments: number;
    objectives: number;
    workersActivated: number;
    connectorsBound: number;
    knowledgeSeeded: number;
  };
}

export async function deployCompanyFromTemplate(input: {
  templateId: string;
  companyName: string;
  connectors?: string[];
  departments?: string[];
  autonomyLevel?: number;
}): Promise<DeploymentResult> {
  const user = await requireUser();

  const template = templateById(input.templateId);
  if (!template) return { ok: false, error: "Unknown template" };

  const name = input.companyName.trim() || template.name;
  const supabase = await createClient();
  const existing = await listCompanies();
  const slug = uniqueSlug(name, existing.map((c) => c.slug));

  const { data, error } = await supabase
    .from("companies")
    .insert({
      user_id: user.id,
      name,
      slug,
      description: template.summary,
      domain: "business",
      position: existing.length,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[deploy-action] createCompany", error?.message);
    return { ok: false, error: "Company creation failed" };
  }
  const companyId = (data as { id: string }).id;

  const result = await provisionCompanyFromTemplate({
    userId: user.id,
    companyId,
    templateId: input.templateId,
    companyName: name,
    autonomyLevel: input.autonomyLevel,
    connectors: input.connectors,
    departments: input.departments,
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Provisioning failed", companyId, companyName: name };
  }

  await emitActivity({
    userId: user.id,
    companyId,
    kind: "system",
    summary: `Company deployed from template “${template.name}”: ${name}`,
    refType: "company",
    refId: companyId,
  }).catch(() => {});

  revalidatePath("/harmony");
  revalidatePath("/harmony/companies");

  return {
    ok: true,
    companyId,
    companyName: name,
    industry: template.industry,
    templateId: template.id,
    templateName: template.name,
    provisioned: {
      departments: result.departments,
      objectives: result.objectives,
      workersActivated: result.workersActivated,
      connectorsBound: result.connectorsBound,
      knowledgeSeeded: result.knowledgeSeeded,
    },
  };
}
