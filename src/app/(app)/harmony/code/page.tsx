import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Code2, Plug, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listDepartments } from "@/lib/data/os/departments";
import { listCompanies } from "@/lib/data/os/companies";
import { listAllAgents } from "@/lib/data/os/agents";
import { listWorkItems } from "@/lib/data/os/work-items";
import { listProjects } from "@/lib/data/os/projects";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import { CODE_INTEGRATIONS } from "@/lib/harmony/os/code";
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
import { WorkDialog } from "@/components/harmony/os/work-dialog";
import { WorkStatusSelect } from "@/components/harmony/os/work-status-select";
import type { TaskPriority } from "@/types/database";

const priorityVariant: Record<TaskPriority, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.code");
  return { title: t("title") };
}

export default async function CodeDepartmentPage() {
  const t = await getTranslations("os.code");
  const tw = await getTranslations("os.workStatus");
  const tp = await getTranslations("os.priority");
  const locale = await getLocale();
  await requireUser();

  const [departments, companies, agents, allWork, projects] = await Promise.all([
    listDepartments(),
    listCompanies(),
    listAllAgents(),
    listWorkItems(),
    listProjects(),
  ]);

  const codeDepts = departments.filter((d) => d.key === "code");
  const codeDeptIds = new Set(codeDepts.map((d) => d.id));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const work = allWork.filter(
    (w) => w.department_id && codeDeptIds.has(w.department_id),
  );

  const dialogProps = {
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    departments: departments.map((d) => ({ id: d.id, name: d.name, company_id: d.company_id })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, department_id: a.department_id })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, company_id: p.company_id })),
  };

  if (codeDepts.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState
          icon={Code2}
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
    { key: "blocked", value: count("blocked") },
    { key: "completed", value: count("completed") },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <WorkDialog {...dialogProps} defaultDepartmentId={codeDepts[0]?.id}>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("newWork")}
          </Button>
        </WorkDialog>
      </PageHeader>

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="size-4 text-primary" aria-hidden="true" />
                {t("board")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {work.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noWork")}</p>
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
                                className="flex items-center justify-between gap-2 rounded-lg border p-3"
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("departments")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {codeDepts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/harmony/departments/${d.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:border-primary/40 hover:bg-accent"
                    >
                      <span className="truncate">{companyName.get(d.company_id) ?? d.name}</span>
                      <Code2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="size-4 text-primary" aria-hidden="true" />
                {t("integrations")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {CODE_INTEGRATIONS.map((i) => (
                  <li
                    key={i.key}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <span className="text-sm font-medium">{i.name}</span>
                    <Badge variant="outline" className="shrink-0">
                      {t("comingSoon")}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{t("integrationsHint")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
