"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Building2, Check, Loader2, Plug, Sparkles, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deployCompanyFromTemplate, type DeploymentResult } from "@/lib/company/deploy-action";
import { DeploymentExperience } from "./deployment-experience";

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

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * The visual Company Builder — a 5-step guided flow (Template → Industry → Tools
 * → Departments → Review & Deploy) that culminates in the signature deployment
 * experience. Deployment calls the EXISTING Enterprise Auto-Provisioning via the
 * `deployCompanyFromTemplate` server action — no duplicated provisioning logic.
 */
export function CompanyBuilder({
  templates,
  initialTemplateId,
}: {
  templates: BuilderTemplate[];
  initialTemplateId?: string;
}) {
  const t = useTranslations("companyBuilder");
  const stepLabels = t.raw("steps") as string[];

  const initial = initialTemplateId ? templates.find((x) => x.id === initialTemplateId) : undefined;
  const [step, setStep] = useState(initial ? 2 : 1);
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [companyName, setCompanyName] = useState(initial?.name ?? "");
  const [connectors, setConnectors] = useState<Set<string>>(new Set(initial?.connectors ?? []));
  const [departments, setDepartments] = useState<Set<string>>(new Set(initial?.departments ?? []));
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DeploymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tpl = templates.find((x) => x.id === selectedId) ?? null;

  function selectTemplate(x: BuilderTemplate) {
    setSelectedId(x.id);
    setCompanyName(x.name);
    setConnectors(new Set(x.connectors));
    setDepartments(new Set(x.departments));
    setStep(2);
  }

  function deploy() {
    if (!tpl || !companyName.trim() || pending) return;
    setError(null);
    start(async () => {
      try {
        const res = await deployCompanyFromTemplate({
          templateId: tpl.id,
          companyName: companyName.trim(),
          connectors: [...connectors],
          departments: [...departments],
        });
        if (res.ok) setResult(res);
        else setError(res.error ?? t("errorGeneric"));
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  // Deployed — show the signature experience.
  if (result) return <DeploymentExperience result={result} />;

  const canNext =
    (step === 1 && !!selectedId) ||
    (step === 2 && companyName.trim().length > 0) ||
    step === 3 ||
    step === 4;

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <ol className="flex flex-wrap gap-2">
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const complete = n < step;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                active ? "border-primary bg-primary/10 text-primary" : complete ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                  active || complete ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {complete ? <Check className="size-3" aria-hidden="true" /> : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border bg-card p-6">
        {/* Step 1 — Choose Company Template */}
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("step1.title")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => selectTemplate(x)}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent",
                    selectedId === x.id ? "border-primary bg-primary/5" : "",
                  )}
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">{x.name}</span>
                  <span className="text-xs font-medium uppercase tracking-wide text-primary/80">{x.industry}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{x.summary}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Step 2 — Company & Industry */}
        {step === 2 && tpl ? (
          <div className="flex max-w-md flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("step2.title")}</h2>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("step2.nameLabel")}</span>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={tpl.name} />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("step2.industryLabel")}</span>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground">
                <Building2 className="size-4" aria-hidden="true" />
                {tpl.industry}
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 3 — Connect Tools */}
        {step === 3 && tpl ? (
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Plug className="size-5 text-primary" aria-hidden="true" /> {t("step3.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("step3.hint")}</p>
            <div className="flex flex-wrap gap-2">
              {tpl.connectors.map((c) => {
                const on = connectors.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setConnectors((s) => toggle(s, c))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {on ? <Check className="size-3.5" aria-hidden="true" /> : <Plug className="size-3.5" aria-hidden="true" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Step 4 — Select AI Departments */}
        {step === 4 && tpl ? (
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5 text-primary" aria-hidden="true" /> {t("step4.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("step4.hint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {tpl.departments.map((d) => {
                const on = departments.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDepartments((s) => toggle(s, d))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      on ? "border-primary bg-primary/5" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-md border",
                        on ? "border-primary bg-primary text-primary-foreground" : "",
                      )}
                    >
                      {on ? <Check className="size-3" aria-hidden="true" /> : null}
                    </span>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Step 5 — Review & Deploy */}
        {step === 5 && tpl ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("step5.title")}</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">{t("step5.company")}</dt>
                <dd className="font-semibold">{companyName}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">{t("step5.template")}</dt>
                <dd className="font-semibold">{tpl.name} · {tpl.industry}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">{t("step3.title")}</dt>
                <dd className="text-sm">{connectors.size > 0 ? [...connectors].join(", ") : "—"}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">{t("step4.title")}</dt>
                <dd className="text-sm">{departments.size > 0 ? [...departments].join(", ") : "—"}</dd>
              </div>
            </dl>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
              {t("step5.willProvision")} · {t("step5.estTime", { n: tpl.deploymentMinutes })}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div>
              <Button size="lg" onClick={deploy} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                {pending ? t("deploy.deploying") : t("deploy.cta")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Nav */}
      {step < 5 ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
            {t("back")}
          </Button>
          <Button disabled={!canNext} onClick={() => setStep((s) => Math.min(5, s + 1))}>
            {t("next")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setStep(4)} disabled={pending}>
            {t("back")}
          </Button>
        </div>
      )}
    </div>
  );
}
