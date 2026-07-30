"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCompanyExecutionPreview,
  buildCompanyRequest,
  type CompanyBuildExecutionPreview,
  type CompanyBuildRequest,
} from "@/lib/harmony/company-builder";
import type { StorefrontViewModel } from "@/lib/marketplace/storefront";

export interface BuilderTemplate {
  id: string;
  name: string;
  industry: string;
  summary: string;
  departments: string[];
  connectors: string[];
  workers: string[];
  version: string;
  deploymentMinutes: number;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function CompanyBuilder({
  templates,
  storefront,
  initialTemplateId,
}: {
  templates: BuilderTemplate[];
  storefront: StorefrontViewModel;
  initialTemplateId?: string;
}) {
  const t = useTranslations("companyBuilder");
  const [description, setDescription] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [industry, setIndustry] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [customersText, setCustomersText] = useState("");
  const [preferencesText, setPreferencesText] = useState("");
  const [request, setRequest] = useState<CompanyBuildRequest | null>(null);
  const [preview, setPreview] = useState<CompanyBuildExecutionPreview | null>(null);

  const initialTemplate = useMemo(
    () => (initialTemplateId ? templates.find((template) => template.id === initialTemplateId) : null),
    [initialTemplateId, templates],
  );

  function createRequest() {
    const computedRequest = buildCompanyRequest({
      description,
      goals: parseList(goalsText),
      industry: industry || initialTemplate?.industry || "",
      servicesOrProducts: parseList(servicesText),
      targetCustomers: parseList(customersText),
      operationalPreferences: parseList(preferencesText),
    });
    const computedPreview = buildCompanyExecutionPreview(computedRequest, storefront);
    setRequest(computedRequest);
    setPreview(computedPreview);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          {t("phase1.requestTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("phase1.requestSubtitle")}</p>

        <div className="mt-5 grid gap-3">
          <label className="text-sm font-medium" htmlFor="builder-description">{t("phase1.fields.description")}</label>
          <Input id="builder-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("phase1.placeholders.description")} />

          <label className="text-sm font-medium" htmlFor="builder-goals">{t("phase1.fields.goals")}</label>
          <Input id="builder-goals" value={goalsText} onChange={(event) => setGoalsText(event.target.value)} placeholder={t("phase1.placeholders.list")} />

          <label className="text-sm font-medium" htmlFor="builder-industry">{t("phase1.fields.industry")}</label>
          <Input id="builder-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder={initialTemplate?.industry ?? t("phase1.placeholders.industry")} />

          <label className="text-sm font-medium" htmlFor="builder-services">{t("phase1.fields.services")}</label>
          <Input id="builder-services" value={servicesText} onChange={(event) => setServicesText(event.target.value)} placeholder={t("phase1.placeholders.list")} />

          <label className="text-sm font-medium" htmlFor="builder-customers">{t("phase1.fields.customers")}</label>
          <Input id="builder-customers" value={customersText} onChange={(event) => setCustomersText(event.target.value)} placeholder={t("phase1.placeholders.list")} />

          <label className="text-sm font-medium" htmlFor="builder-preferences">{t("phase1.fields.preferences")}</label>
          <Input id="builder-preferences" value={preferencesText} onChange={(event) => setPreferencesText(event.target.value)} placeholder={t("phase1.placeholders.list")} />

          <Button type="button" className="mt-2" onClick={createRequest}>
            {t("phase1.actions.createRequest")}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("phase1.previewTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("phase1.previewSubtitle")}</p>

        {!request || !preview ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("phase1.emptyPreview")}</p>
        ) : (
          <div className="mt-5 grid gap-4 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase1.structuredRequest")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{request.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("phase1.labels.industry")}: {request.industry || "—"}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase1.executionPreview")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("phase1.labels.mode")}: {preview.mode} · {t("phase1.labels.actionRequired")}: {preview.actionRequired ? "yes" : "no"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("phase1.labels.approval")}: {preview.approvalState}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase1.labels.marketplaceSignals")}</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                <li>{t("phase1.labels.workers")}: {preview.recommendations.workers.length}</li>
                <li>{t("phase1.labels.departments")}: {preview.recommendations.departments.length}</li>
                <li>{t("phase1.labels.connectors")}: {preview.recommendations.connectors.length}</li>
                <li>{t("phase1.labels.templates")}: {preview.recommendations.templates.length}</li>
                <li>{t("phase1.labels.bundles")}: {preview.recommendations.bundles.length}</li>
              </ul>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase1.labels.notes")}</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                {preview.notes.map((note) => (
                  <li key={note} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3" aria-hidden="true" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
