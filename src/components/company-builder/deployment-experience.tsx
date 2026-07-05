"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { DeploymentResult } from "@/lib/company/deploy-action";

/**
 * The signature AIOS deployment experience. Once provisioning completes
 * server-side, this reveals each subsystem coming online in sequence, then
 * presents the deployment summary — so the Founder sees, tangibly, that a
 * COMPLETE autonomous company was just stood up.
 */
export function DeploymentExperience({ result }: { result: DeploymentResult }) {
  const t = useTranslations("companyBuilder");
  const subsystems = t.raw("subsystems") as string[];
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= subsystems.length) return;
    const id = setTimeout(() => setRevealed((n) => n + 1), 260);
    return () => clearTimeout(id);
  }, [revealed, subsystems.length]);

  const done = revealed >= subsystems.length;
  const p = result.provisioned;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          {done ? t("deploy.doneTitle", { name: result.companyName ?? "" }) : t("deploy.provisioningTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.templateName} · {result.industry}
        </p>
      </div>

      {/* Subsystem initialization checklist */}
      <ul className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        {subsystems.map((label, i) => {
          const state = i < revealed ? "done" : i === revealed ? "active" : "pending";
          return (
            <li
              key={label}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (state === "pending" ? "opacity-40" : "opacity-100")
              }
            >
              {state === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : state === "active" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border" aria-hidden="true" />
              )}
              <span className="font-medium">{label}</span>
            </li>
          );
        })}
      </ul>

      {/* Deployment summary */}
      {done && p ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm font-semibold">{t("deploy.summaryTitle")}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              [t("summary.departments"), p.departments],
              [t("summary.workers"), p.workersActivated],
              [t("summary.objectives"), p.objectives],
              [t("summary.connectors"), p.connectorsBound],
              [t("summary.knowledge"), p.knowledgeSeeded],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border bg-background p-3">
                <dd className="text-2xl font-bold tracking-tight">{value as number}</dd>
                <dt className="text-xs text-muted-foreground">{label as string}</dt>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">{t("deploy.reconsentNote")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/harmony">{t("deploy.openCompany")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/harmony/marketplace">{t("deploy.backToMarketplace")}</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
