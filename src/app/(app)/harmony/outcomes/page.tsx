import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Package, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listCompanies } from "@/lib/data/os/companies";
import { listWorkItems } from "@/lib/data/os/work-items";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Customer Outcomes Digest — the public-facing RESULTS of AIOS, company-scoped
 * and outcomes-only. Built on the OS company work layer: completed deliverables,
 * active work status, and progress. Deliberately shows NO internal AIOS signals
 * (agent reasoning, A2A messages, recommendations, autonomy audit, approvals,
 * internal work queue, or internal objectives).
 */

const ACTIVE = ["pending", "in_progress", "awaiting_approval"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("outcomes");
  return { title: t("title") };
}

export default async function CustomerOutcomesPage() {
  const t = await getTranslations("outcomes");
  const locale = await getLocale();
  await requireUser();

  const [companies, work] = await Promise.all([listCompanies(), listWorkItems()]);

  if (companies.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState icon={Package} title={t("empty.title")} description={t("empty.description")} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {companies.map((c) => {
          const items = work.filter((w) => w.company_id === c.id);
          const completed = items
            .filter((w) => w.status === "completed")
            .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
          const active = items.filter((w) => ACTIVE.includes(w.status));
          const pct = items.length ? Math.round((completed.length / items.length) * 100) : 0;
          return (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{c.name}</span>
                  <Badge variant="secondary">{t("progress", { pct })}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label={t("deliverables")} n={completed.length} />
                  <Stat label={t("active")} n={active.length} />
                  <Stat label={t("total")} n={items.length} />
                </div>

                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("recentlyCompleted")}
                  </h3>
                  {completed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noneCompleted")}</p>
                  ) : (
                    <ul className="space-y-1">
                      {completed.slice(0, 6).map((w) => (
                        <li key={w.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{w.title}</span>
                          {w.due_date ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDate(w.due_date, locale)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button asChild size="sm" variant="outline">
                  <Link href="/harmony/content">{t("viewArtifacts")}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-bold tabular-nums">{n}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
