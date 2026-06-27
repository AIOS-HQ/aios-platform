import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, Pencil, Plus, BarChart3, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listContentItems } from "@/lib/data/content/items";
import { listCompanies } from "@/lib/data/os/companies";
import { deleteContentItem } from "@/lib/harmony/content/calendar-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentSubnav } from "@/components/harmony/content/content-subnav";
import { ContentItemDialog } from "@/components/harmony/content/content-item-dialog";
import { ContentStatusSelect } from "@/components/harmony/content/content-status-select";
import { MetricsDialog } from "@/components/harmony/content/metrics-dialog";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";
import type { ContentItem } from "@/types/database";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.content");
  return { title: `${t("title")} · ${t("tabs.calendar")}` };
}

export default async function ContentCalendarPage() {
  const t = await getTranslations("os.content");
  const tf = await getTranslations("os.contentFormat");
  const locale = await getLocale();
  await requireUser();

  const [items, companies] = await Promise.all([
    listContentItems(),
    listCompanies(),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));

  const scheduled = items.filter((i) => i.scheduled_for);
  const unscheduled = items.filter((i) => !i.scheduled_for);

  const row = (i: ContentItem) => (
    <li
      key={i.id}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{i.title}</span>
          <Badge variant="outline" className="shrink-0">{tf(i.format)}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {i.scheduled_for ? formatDate(i.scheduled_for, locale) : t("unscheduled")}
          {i.channel ? ` · ${i.channel}` : ""}
          {i.company_id && companyName.get(i.company_id)
            ? ` · ${companyName.get(i.company_id)}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ContentStatusSelect id={i.id} status={i.status} />
        <MetricsDialog item={i}>
          <Button variant="ghost" size="icon" aria-label={t("metricsTitle")}>
            <BarChart3 className="size-4" aria-hidden="true" />
          </Button>
        </MetricsDialog>
        <ContentItemDialog companies={companyOpts} item={i}>
          <Button variant="ghost" size="icon" aria-label={t("editTitle")}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        </ContentItemDialog>
        <ConfirmDeleteDialog action={deleteContentItem} id={i.id} itemTitle={i.title}>
          <Button variant="ghost" size="icon" aria-label={t("deleteItem")}>
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </ConfirmDeleteDialog>
      </div>
    </li>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <ContentItemDialog companies={companyOpts}>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("newItem")}
          </Button>
        </ContentItemDialog>
      </PageHeader>

      <ContentSubnav active="calendar" />

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t("calendarEmpty.title")}
          description={t("calendarEmpty.description")}
        >
          <ContentItemDialog companies={companyOpts}>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("newItem")}
            </Button>
          </ContentItemDialog>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricTile
              label={t("scheduledHeading")}
              value={scheduled.length}
              icon={CalendarDays}
              tone="info"
            />
            <MetricTile
              label={t("backlogHeading")}
              value={unscheduled.length}
              icon={Pencil}
            />
            <MetricTile
              label={t("tabs.calendar")}
              value={items.length}
              icon={BarChart3}
              tone="success"
            />
          </div>

          <ExecutiveSection icon={CalendarDays} title={t("scheduledHeading")}>
            <Card>
              <CardContent className="p-5">
              {scheduled.length === 0 ? (
                <InlineEmpty icon={CalendarDays} message={t("noScheduled")} />
              ) : (
                <ExecutiveList>{scheduled.map(row)}</ExecutiveList>
              )}
              </CardContent>
            </Card>
          </ExecutiveSection>

          {unscheduled.length > 0 && (
            <ExecutiveSection icon={Pencil} title={t("backlogHeading")}>
              <Card>
                <CardContent className="p-5">
                  <ExecutiveList>{unscheduled.map(row)}</ExecutiveList>
                </CardContent>
              </Card>
            </ExecutiveSection>
          )}
        </div>
      )}
    </>
  );
}
