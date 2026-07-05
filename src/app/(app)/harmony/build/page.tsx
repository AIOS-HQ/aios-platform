import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { COMPANY_TEMPLATES, templateBySlug } from "@/lib/marketplace/templates";
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
      <CompanyBuilder templates={templates} initialTemplateId={initialTemplateId} />
    </>
  );
}
