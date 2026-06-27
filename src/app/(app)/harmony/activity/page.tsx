import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listActivity } from "@/lib/data/os/activity";
import { listCompanies } from "@/lib/data/os/companies";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ExecutiveList, ExecutiveSection, MetricTile } from "@/components/shared/executive";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.activityFeed");
  return { title: t("title") };
}

export default async function ActivityPage() {
  const t = await getTranslations("os.activityFeed");
  const tk = await getTranslations("os.activityKind");
  const locale = await getLocale();
  await requireUser();

  const [events, companies] = await Promise.all([
    listActivity({ limit: 150 }),
    listCompanies(),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const primaryKind = events[0]?.kind;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricTile label={t("title")} value={events.length} icon={Activity} />
            <MetricTile
              label={primaryKind ? tk(primaryKind) : t("title")}
              value={primaryKind ? events.filter((e) => e.kind === primaryKind).length : 0}
              icon={Activity}
              tone="info"
            />
            <MetricTile
              label={t("subtitle")}
              value={new Set(events.map((e) => e.company_id).filter(Boolean)).size}
              icon={Activity}
              tone="success"
            />
          </div>
          <ExecutiveSection icon={Activity} title={t("title")}>
            <ExecutiveList>
              {events.map((e) => (
                <li key={e.id} className="relative p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {tk(e.kind)}
                    </Badge>
                    {e.company_id && companyName.get(e.company_id) && (
                      <span className="text-xs text-muted-foreground">
                        {companyName.get(e.company_id)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(e.created_at, locale)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{e.summary}</p>
                </li>
              ))}
            </ExecutiveList>
          </ExecutiveSection>
        </div>
      )}
    </>
  );
}
