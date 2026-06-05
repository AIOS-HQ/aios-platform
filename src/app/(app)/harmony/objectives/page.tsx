import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Plus, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listObjectives } from "@/lib/data/os/objectives";
import { listCompanies } from "@/lib/data/os/companies";
import { listDepartments } from "@/lib/data/os/departments";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ObjectiveDialog } from "@/components/harmony/os/objective-dialog";
import type { ObjectiveStatus } from "@/types/database";

const statusVariant: Record<
  ObjectiveStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  active: "default",
  paused: "secondary",
  completed: "success",
  archived: "outline",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.objectives");
  return { title: t("title") };
}

export default async function ObjectivesPage() {
  const t = await getTranslations("os.objectives");
  const ts = await getTranslations("os.objectiveStatus");
  const locale = await getLocale();
  await requireUser();

  const [objectives, companies, departments] = await Promise.all([
    listObjectives(),
    listCompanies(),
    listDepartments(),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const deptOpts = departments.map((d) => ({
    id: d.id,
    name: d.name,
    company_id: d.company_id,
  }));

  const canCreate = companies.length > 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        {canCreate && (
          <ObjectiveDialog companies={companies} departments={deptOpts}>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </ObjectiveDialog>
        )}
      </PageHeader>

      {!canCreate ? (
        <EmptyState
          icon={Target}
          title={t("noCompanies.title")}
          description={t("noCompanies.description")}
        >
          <Button asChild variant="outline">
            <Link href="/harmony/companies">{t("noCompanies.cta")}</Link>
          </Button>
        </EmptyState>
      ) : objectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <ObjectiveDialog companies={companies} departments={deptOpts}>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </ObjectiveDialog>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {objectives.map((o) => (
            <li key={o.id}>
              <Link
                href={`/harmony/objectives/${o.id}`}
                className="group flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {companyName.get(o.company_id) ?? ""}
                      {o.due_date ? ` · ${formatDate(o.due_date, locale)}` : ""}
                    </p>
                  </div>
                  <Badge variant={statusVariant[o.status]} className="shrink-0">
                    {ts(o.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={o.progress} className="flex-1" />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {o.progress}%
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
