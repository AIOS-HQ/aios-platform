import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ListChecks, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listWorkItems } from "@/lib/data/os/work-items";
import { listCompanies } from "@/lib/data/os/companies";
import { listObjectives } from "@/lib/data/os/objectives";
import { listDepartments } from "@/lib/data/os/departments";
import { listAllAgents } from "@/lib/data/os/agents";
import { listProjects } from "@/lib/data/os/projects";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import { deleteWorkItem } from "@/lib/harmony/os/work-actions";
import { runWorkItem } from "@/lib/harmony/os/delegate-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkDialog } from "@/components/harmony/os/work-dialog";
import { WorkStatusSelect } from "@/components/harmony/os/work-status-select";
import { HarmonyDelegateDialog } from "@/components/harmony/os/harmony-delegate-dialog";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";
import { ActionButton } from "@/components/shared/action-button";
import type { TaskPriority } from "@/types/database";

const priorityVariant: Record<TaskPriority, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.work");
  return { title: t("title") };
}

export default async function WorkManagementPage() {
  const t = await getTranslations("os.work");
  const tw = await getTranslations("os.workStatus");
  const tp = await getTranslations("os.priority");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  await requireUser();

  const [items, companies, objectives, departments, agents, projects] = await Promise.all([
     listWorkItems(),
     listCompanies(),
     listObjectives(),
     listDepartments(),
     listAllAgents(),
     listProjects(),
  ]);

  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const deptOpts = departments.map((d) => ({ id: d.id, name: d.name, company_id: d.company_id }));
  const agentOpts = agents.map((a) => ({ id: a.id, name: a.name, department_id: a.department_id }));
  const projectOpts = projects.map((p) => ({ id: p.id, name: p.name, company_id: p.company_id }));
  const canCreate = companies.length > 0;

  const dialogProps = {
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    objectives: objectives.map((o) => ({ id: o.id, name: o.title })),
    departments: deptOpts,
    agents: agentOpts,
    projects: projectOpts,
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        {canCreate && (
          <>
            <HarmonyDelegateDialog
              companies={dialogProps.companies}
              departments={dialogProps.departments}
              objectives={dialogProps.objectives}
            >
              <Button>
                <Sparkles className="size-4" aria-hidden="true" />
                {t("delegate")}
              </Button>
            </HarmonyDelegateDialog>
            <WorkDialog {...dialogProps}>
              <Button variant="outline">
                <Plus className="size-4" aria-hidden="true" />
                {t("new")}
              </Button>
            </WorkDialog>
          </>
        )}
      </PageHeader>

      {!canCreate ? (
        <EmptyState
          icon={ListChecks}
          title={t("noCompanies.title")}
          description={t("noCompanies.description")}
        >
          <Button asChild variant="outline">
            <Link href="/harmony/companies">{t("noCompanies.cta")}</Link>
          </Button>
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <WorkDialog {...dialogProps}>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </WorkDialog>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {WORK_STATUSES.filter((s) => items.some((i) => i.status === s)).map(
            (s) => {
              const group = items.filter((i) => i.status === s);
              return (
                <section key={s} aria-label={tw(s)}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    {tw(s)}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                      {group.length}
                    </span>
                  </h2>
                  <ul className="space-y-2">
                    {group.map((item) => {
                      const meta = [
                        companyName.get(item.company_id),
                        item.department_id ? deptName.get(item.department_id) : null,
                        item.agent_id ? agentName.get(item.agent_id) : null,
                        item.due_date ? formatDate(item.due_date, locale) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{item.title}</span>
                              <Badge variant={priorityVariant[item.priority]} className="shrink-0">
                                {tp(item.priority)}
                              </Badge>
                            </div>
                            {meta && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {meta}
                              </p>
                            )}
                          </div>
                       {item.description && (
  <p className="mt-1 text-xs text-muted-foreground">
    {item.status === "blocked"
      ? item.description.split("Result").pop()?.trim()
      : item.description.split("\n")[0]}
  </p>
)}
                          <div className="flex shrink-0 items-center gap-1">
                            {(item.status === "pending" || item.status === "blocked") && (
                              <ActionButton
                                action={runWorkItem}
                                fields={{ id: item.id }}
                                variant="ghost"
                                size="icon"
                                className="size-8 text-primary"
                                aria-label={t("run")}
                                successMessage={t("runToast")}
                              >
                                <Play className="size-4" aria-hidden="true" />
                              </ActionButton>
                            )}
                            <WorkStatusSelect id={item.id} status={item.status} />
                            <WorkDialog {...dialogProps} workItem={item}>
                              <Button variant="ghost" size="icon" className="size-8" aria-label={tc("edit")}>
                                <Pencil className="size-4" aria-hidden="true" />
                              </Button>
                            </WorkDialog>
                            <ConfirmDeleteDialog action={deleteWorkItem} id={item.id} itemTitle={item.title}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                aria-label={tc("delete")}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </ConfirmDeleteDialog>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            },
          )}
        </div>
      )}
    </>
  );
}
