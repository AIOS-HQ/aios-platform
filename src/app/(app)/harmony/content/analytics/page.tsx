import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listContentItems } from "@/lib/data/content/items";
import {
  CONTENT_METRIC_KEYS,
  summarizeContent,
} from "@/lib/harmony/content/insights";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContentSubnav } from "@/components/harmony/content/content-subnav";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.content");
  return { title: `${t("title")} · ${t("tabs.analytics")}` };
}

export default async function ContentAnalyticsPage() {
  const t = await getTranslations("os.content");
  const ta = await getTranslations("os.content.analytics");
  const tm = await getTranslations("os.contentMetric");
  await requireUser();

  const items = await listContentItems();
  const summary = summarizeContent(items);

  const fmt = (n: number) => n.toLocaleString();
  const headline = [
    { key: "total", value: fmt(summary.total) },
    { key: "published", value: fmt(summary.published) },
    { key: "scheduled", value: fmt(summary.scheduled) },
    { key: "engagement", value: `${(summary.engagementRate * 100).toFixed(1)}%` },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ContentSubnav active="analytics" />

      {items.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={ta("empty.title")}
          description={ta("empty.description")}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {headline.map((s, index) => (
              <MetricTile
                key={s.key}
                label={ta(s.key)}
                value={s.value}
                icon={BarChart3}
                tone={index === 3 ? "success" : index === 2 ? "info" : "neutral"}
                detail={ta("hint")}
              />
            ))}
          </div>

          <ExecutiveSection icon={BarChart3} title={ta("totals")} description={ta("hint")}>
            <Card>
              <CardContent className="p-5">
              <div className="grid gap-3 sm:grid-cols-5">
                {CONTENT_METRIC_KEYS.map((k) => (
                  <div key={k} className="rounded-xl border bg-background p-4 shadow-soft">
                    <p className="text-xl font-semibold tabular-nums">
                      {fmt(summary.totals[k])}
                    </p>
                    <p className="text-xs text-muted-foreground">{tm(k)}</p>
                  </div>
                ))}
              </div>
              </CardContent>
            </Card>
          </ExecutiveSection>

          <ExecutiveSection icon={BarChart3} title={ta("top")}>
            <Card>
              <CardContent className="p-5">
              <ExecutiveList>
                {summary.top.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="truncate text-sm font-semibold">{i.title}</span>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {fmt(i.views)} · {tm("views")}
                    </Badge>
                  </li>
                ))}
              </ExecutiveList>
              </CardContent>
            </Card>
          </ExecutiveSection>
        </div>
      )}
    </>
  );
}
