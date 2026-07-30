import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { COMPANY_TEMPLATES, templateBySlug } from "@/lib/marketplace/templates";
import { loadStorefrontViewModel } from "@/lib/marketplace/storefront";
import { PageHeader } from "@/components/shared/page-header";
import { CompanyBuilder, type BuilderTemplate } from "@/components/company-builder/company-builder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("companyBuilder");
  return { title: t("title") };
}

export default async function CompanyBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const t = await getTranslations("companyBuilder");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const storefront = await loadStorefrontViewModel(user.id, companyId);
  const sp = await searchParams;

  const templates: BuilderTemplate[] = COMPANY_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    industry: tpl.industry,
    summary: tpl.summary,
    departments: [...tpl.departments],
    connectors: [...tpl.connectors],
    workers: tpl.workforce.map((w) => w.role),
    version: tpl.version,
    deploymentMinutes: Math.max(2, tpl.workforce.length),
  }));
  const initialTemplateId = sp.template ? templateBySlug(sp.template)?.id : undefined;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CompanyBuilder templates={templates} storefront={storefront} initialTemplateId={initialTemplateId} />
    </>
  );
}
