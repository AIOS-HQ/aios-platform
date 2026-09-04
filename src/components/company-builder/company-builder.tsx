"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, MessageCircle, Sparkles } from "lucide-react";
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

type ConversationStepKey =
  | "vision"
  | "industry"
  | "services"
  | "customers"
  | "goals"
  | "scale"
  | "geography"
  | "differentiation"
  | "operations";

interface ConversationStep {
  key: ConversationStepKey;
  prompt: string;
  placeholder: string;
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
  const initialTemplate = useMemo(
    () => (initialTemplateId ? templates.find((template) => template.id === initialTemplateId) : null),
    [initialTemplateId, templates],
  );

  const steps: ConversationStep[] = [
    { key: "vision", prompt: t("phase2.prompts.vision"), placeholder: t("phase2.placeholders.vision") },
    {
      key: "industry",
      prompt: t("phase2.prompts.industry"),
      placeholder: initialTemplate?.industry ?? t("phase2.placeholders.industry"),
    },
    { key: "services", prompt: t("phase2.prompts.services"), placeholder: t("phase2.placeholders.list") },
    { key: "customers", prompt: t("phase2.prompts.customers"), placeholder: t("phase2.placeholders.list") },
    { key: "goals", prompt: t("phase2.prompts.goals"), placeholder: t("phase2.placeholders.list") },
    { key: "scale", prompt: t("phase2.prompts.scale"), placeholder: t("phase2.placeholders.scale") },
    {
      key: "geography",
      prompt: t("phase2.prompts.geography"),
      placeholder: t("phase2.placeholders.geography"),
    },
    {
      key: "differentiation",
      prompt: t("phase2.prompts.differentiation"),
      placeholder: t("phase2.placeholders.differentiation"),
    },
    {
      key: "operations",
      prompt: t("phase2.prompts.operations"),
      placeholder: t("phase2.placeholders.list"),
    },
  ];

  const [answers, setAnswers] = useState<Record<ConversationStepKey, string>>({
    vision: "",
    industry: initialTemplate?.industry ?? "",
    services: "",
    customers: "",
    goals: "",
    scale: "",
    geography: "",
    differentiation: "",
    operations: "",
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [request, setRequest] = useState<CompanyBuildRequest | null>(null);
  const [preview, setPreview] = useState<CompanyBuildExecutionPreview | null>(null);

  const activeStep = steps[currentStep] ?? null;

  function saveCurrentStep() {
    if (!activeStep) return;
    setAnswers((previous) => ({
      ...previous,
      [activeStep.key]: draft.trim(),
    }));
  }

  function nextStep() {
    saveCurrentStep();
    if (currentStep < steps.length - 1) {
      const nextIndex = currentStep + 1;
      const next = steps[nextIndex];
      setCurrentStep(nextIndex);
      setDraft(next ? answers[next.key] ?? "" : "");
    }
  }

  function previousStep() {
    saveCurrentStep();
    if (currentStep > 0) {
      const previousIndex = currentStep - 1;
      const previous = steps[previousIndex];
      setCurrentStep(previousIndex);
      setDraft(previous ? answers[previous.key] ?? "" : "");
    }
  }

  function createPreview() {
    saveCurrentStep();
    const input = {
      ...answers,
      [activeStep?.key ?? "vision"]: draft.trim(),
    } as Record<ConversationStepKey, string>;

    const computedRequest = buildCompanyRequest({
      description: input.vision,
      goals: parseList(input.goals),
      industry: input.industry,
      servicesOrProducts: parseList(input.services),
      targetCustomers: parseList(input.customers),
      operationalPreferences: parseList([input.operations, input.scale, input.geography, input.differentiation].join(",")),
    });
    const computedPreview = buildCompanyExecutionPreview(computedRequest, storefront);
    setAnswers(input);
    setRequest(computedRequest);
    setPreview(computedPreview);
  }

  const completion = Math.round(((currentStep + 1) / steps.length) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageCircle className="size-4 text-primary" aria-hidden="true" />
          {t("phase2.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("phase2.subtitle")}</p>

        <div className="mt-4 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>{t("phase2.progress", { current: currentStep + 1, total: steps.length, percent: completion })}</p>
          <p className="mt-1">{t("phase2.guidance")}</p>
        </div>

        {activeStep ? (
          <div className="mt-5 grid gap-3">
            <p className="text-sm font-medium">{activeStep.prompt}</p>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={activeStep.placeholder}
              aria-label={activeStep.prompt}
            />

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={previousStep} disabled={currentStep === 0}>
                {t("back")}
              </Button>
              {currentStep < steps.length - 1 ? (
                <Button type="button" onClick={nextStep}>
                  {t("next")} <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" onClick={createPreview}>
                  {t("phase2.actions.preview")}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium">{t("phase2.summaryTitle")}</p>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {steps.map((step) => (
              <li key={step.key}>
                <span className="font-medium text-foreground/80">{step.prompt}</span>
                <span>: {answers[step.key] || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          {t("phase2.previewTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("phase2.previewSubtitle")}</p>

        {!request || !preview ? (
          <p className="mt-5 text-sm text-muted-foreground">{t("phase2.emptyPreview")}</p>
        ) : (
          <div className="mt-5 grid gap-4 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.executiveSummaryTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.executiveSummary}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.strategicInsightsTitle")}</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.strategicInsights.map((insight) => (
                  <li key={insight}>{insight}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.opportunitiesTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.keyOpportunities.join(" • ") || t("phase2.briefing.none")}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.risksTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.primaryRisks.join(" • ") || t("phase2.briefing.none")}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.recommendedPrioritiesTitle")}</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.recommendedPriorities.map((priority) => (
                  <li key={priority} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3" aria-hidden="true" />
                    {priority}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.alternativeStrategiesTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.alternativeStrategies.join(" • ")}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.strategicOptionsTitle")}</p>
              <ul className="mt-1 grid gap-2 text-xs text-muted-foreground">
                {preview.decisionAnalysis.options.map((option) => (
                  <li key={option.strategyName} className="rounded border bg-background/70 p-2">
                    <p className="font-medium text-foreground">{option.strategyName}</p>
                    <p className="mt-0.5">{option.executiveSummary}</p>
                    <p className="mt-1">
                      {t("phase2.briefing.optionComplexity")}: {option.estimatedComplexity} • {t("phase2.briefing.optionHorizon")}: {option.estimatedTimeHorizon} • {t("phase2.briefing.optionConfidence")}: {option.confidenceLevel}
                    </p>
                    <p className="mt-1">{option.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.comparativeAnalysisTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.comparativeAnalysis}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.recommendedStrategyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.recommendedStrategy}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.decisionAnalysis.recommendedStrategy.selectionRationale}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.decisionAnalysis.recommendedStrategy.alternativeRankingRationale}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.executiveDecisionSummaryTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.executiveDecisionSummary}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.capabilitySummaryTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.capabilitySummary}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.capabilityMapTitle")}</p>
              <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.capabilityMap.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.marketplaceReuseSummaryTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.marketplaceReuseSummary}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.capabilityGapsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.capabilityGaps.join(" • ") || t("phase2.briefing.none")}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.recommendedBuildSequenceTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.recommendedBuildSequence.join(" • ") || t("phase2.briefing.none")}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.marketplaceFindingsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {preview.executiveBriefing.marketplaceIntelligenceFindings.join(" • ") || t("phase2.briefing.none")}
              </p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.confidenceTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.confidenceAssessment}</p>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <p className="font-medium">{t("phase2.briefing.nextDecisionsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{preview.executiveBriefing.nextExecutiveDecisions.join(" • ")}</p>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <p>{t("phase2.briefing.approvalBoundary", { state: preview.approvalState })}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
