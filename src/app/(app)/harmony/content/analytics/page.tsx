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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContentSubnav } from "@/components/harmony/content/content-subnav";

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {headline.map((s) => (
              <Card key={s.key}>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{ta(s.key)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{ta("totals")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {CONTENT_METRIC_KEYS.map((k) => (
                  <div key={k} className="rounded-lg border p-3">
                    <p className="text-xl font-semibold tabular-nums">
                      {fmt(summary.totals[k])}
                    </p>
                    <p className="text-xs text-muted-foreground">{tm(k)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{ta("hint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4 text-primary" aria-hidden="true" />
                {ta("top")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {summary.top.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <span className="truncate text-sm font-medium">{i.title}</span>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {fmt(i.views)} · {tm("views")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
