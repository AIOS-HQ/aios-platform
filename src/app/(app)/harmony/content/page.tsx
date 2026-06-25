import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Clapperboard, Plug, Plus, Sparkles, Users, Wand2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listDepartments } from "@/lib/data/os/departments";
import { listCompanies } from "@/lib/data/os/companies";
import { listAllAgents } from "@/lib/data/os/agents";
import { listWorkItems } from "@/lib/data/os/work-items";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import { CONTENT_TASK_TYPES } from "@/lib/harmony/content/catalog";
import {
  CONTENT_ENGINE_CATEGORIES,
  contentEnginesByCategory,
} from "@/lib/harmony/content/providers";
import { enableContentDepartment } from "@/lib/harmony/content/content-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentEngineIcon } from "@/components/brand/brand-icons";
import { WorkStatusSelect } from "@/components/harmony/os/work-status-select";
import { GenerateContentDialog } from "@/components/harmony/content/generate-dialog";
import { ContentSubnav } from "@/components/harmony/content/content-subnav";
import { CatalystWorkspace } from "@/components/harmony/content/catalyst-workspace";
import { DiscoveredConnectors } from "@/components/integrations/discovered-connectors";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { ActionButton } from "@/components/shared/action-button";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/types/database";

const priorityVariant: Record<TaskPriority, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.content");
  return { title: t("title") };
}

export default async function ContentDepartmentPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const highlightId = (await searchParams).item;
  const t = await getTranslations("os.content");
  const tt = await getTranslations("os.contentTask");
  const th = await getTranslations("os.contentHelper");
  const te = await getTranslations("os.contentEngineCategory");
  const tw = await getTranslations("os.workStatus");
  const tp = await getTranslations("os.priority");
  const locale = await getLocale();
  await requireUser();

  const [departments, companies, agents, allWork] = await Promise.all([
    listDepartments(),
    listCompanies(),
    listAllAgents(),
    listWorkItems(),
  ]);

  const contentDepts = departments.filter((d) => d.key === "content");
  const contentDeptIds = new Set(contentDepts.map((d) => d.id));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const work = allWork.filter(
    (w) => w.department_id && contentDeptIds.has(w.department_id),
  );
  const helpers = agents.filter((a) => contentDeptIds.has(a.department_id));
  const companiesWithContent = companies
    .filter((c) => contentDepts.some((d) => d.company_id === c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  const companiesWithout = companies.filter(
    (c) => !contentDepts.some((d) => d.company_id === c.id),
  );

  // No companies at all → point to the company setup.
  if (companies.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState
          icon={Clapperboard}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <Button asChild variant="outline">
            <Link href="/harmony/companies">{t("empty.cta")}</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  const count = (s: string) => work.filter((w) => w.status === s).length;
  const stats: { key: string; value: number }[] = [
    { key: "pending", value: count("pending") },
    { key: "in_progress", value: count("in_progress") },
    { key: "awaiting_approval", value: count("awaiting_approval") },
    { key: "completed", value: count("completed") },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        {companiesWithContent.length > 0 && (
          <GenerateContentDialog companies={companiesWithContent}>
            <Button>
              <Sparkles className="size-4" aria-hidden="true" />
              {t("generateButton")}
            </Button>
          </GenerateContentDialog>
        )}
      </PageHeader>

      <ContentSubnav active="hub" />

      <CatalystWorkspace />

      <DiscoveredConnectors kind="publishers" />

      {/* Companies still missing a Content department → one-click enable. */}
      {companiesWithout.length > 0 && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">{t("enable.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {t("enable.description")}
            </p>
            <ul className="flex flex-wrap gap-2">
              {companiesWithout.map((c) => (
                <li key={c.id}>
                  <ActionButton
                    action={enableContentDepartment}
                    fields={{ company_id: c.id }}
                    variant="outline"
                    size="sm"
                    successMessage={t("enable.added")}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("enable.button", { company: c.name })}
                  </ActionButton>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {companiesWithContent.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{tw(s.key)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Generation capabilities. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="size-4 text-primary" aria-hidden="true" />
                {t("capabilities")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {companiesWithContent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("enable.description")}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONTENT_TASK_TYPES.map((task) => (
                    <GenerateContentDialog
                      key={task.key}
                      companies={companiesWithContent}
                      defaultTaskKey={task.key}
                    >
                      <button
                        type="button"
                        className="rounded-lg border p-3 text-left transition hover:border-primary/40 hover:bg-accent"
                      >
                        <span className="block text-sm font-medium">
                          {tt(`${task.key}.label`)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {tt(`${task.key}.desc`)}
                        </span>
                      </button>
                    </GenerateContentDialog>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content work board. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clapperboard className="size-4 text-primary" aria-hidden="true" />
                {t("board")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {work.length === 0 ? (
                <InlineEmpty icon={Clapperboard} message={t("noWork")} />
              ) : (
                <div className="space-y-5">
                  {WORK_STATUSES.filter((s) => work.some((w) => w.status === s)).map(
                    (s) => (
                      <section key={s} aria-label={tw(s)}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {tw(s)}
                        </h3>
                        <ul className="space-y-2">
                          {work
                            .filter((w) => w.status === s)
                            .map((w) => (
                              <li
                                key={w.id}
                                id={`item-${w.id}`}
                                className={cn(
                                  "flex scroll-mt-20 items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                                  w.id === highlightId &&
                                    "border-primary/50 bg-primary/5 ring-2 ring-primary/30",
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{w.title}</span>
                                    <Badge variant={priorityVariant[w.priority]} className="shrink-0">
                                      {tp(w.priority)}
                                    </Badge>
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {companyName.get(w.company_id) ?? ""}
                                    {w.due_date ? ` · ${formatDate(w.due_date, locale)}` : ""}
                                  </p>
                                </div>
                                <WorkStatusSelect id={w.id} status={w.status} />
                              </li>
                            ))}
                        </ul>
                      </section>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Helpers. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("helpers")}</CardTitle>
            </CardHeader>
            <CardContent>
              {helpers.length === 0 ? (
                <InlineEmpty icon={Users} message={t("noHelpers")} />
              ) : (
                <ul className="space-y-2">
                  {contentDepts.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/harmony/departments/${d.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:border-primary/40 hover:bg-accent"
                      >
                        <span className="truncate">
                          {companyName.get(d.company_id) ?? d.name}
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {helpers.filter((h) => h.department_id === d.id).length}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{th("hint")}</p>
            </CardContent>
          </Card>

          {/* Future engines / integrations. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="size-4 text-primary" aria-hidden="true" />
                {t("engines")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONTENT_ENGINE_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {te(cat)}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {contentEnginesByCategory(cat).map((e) => (
                      <li key={e.key}>
                        <Badge variant="outline" className="gap-1.5">
                          <ContentEngineIcon engineKey={e.key} className="size-3.5" />
                          {e.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t("enginesHint")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
