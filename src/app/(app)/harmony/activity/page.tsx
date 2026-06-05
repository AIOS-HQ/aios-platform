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
        <ol className="relative space-y-4 border-l pl-6">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span
                className="absolute -left-[1.65rem] top-1.5 size-2.5 rounded-full bg-primary"
                aria-hidden="true"
              />
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
              <p className="mt-1 text-sm">{e.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
