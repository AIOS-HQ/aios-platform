import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getObjective } from "@/lib/data/os/objectives";
import { getCompany } from "@/lib/data/os/companies";
import { getDepartment } from "@/lib/data/os/departments";
import { listCompanies } from "@/lib/data/os/companies";
import { listDepartments } from "@/lib/data/os/departments";
import { deleteObjective } from "@/lib/harmony/os/objective-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ObjectiveProgressControl } from "@/components/harmony/os/objective-progress-control";
import { ObjectiveDialog } from "@/components/harmony/os/objective-dialog";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await requireUser();
  const objective = await getObjective(id);
  return { title: objective?.title ?? "Objective" };
}

export default async function ObjectiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("os.objectives");
  const ts = await getTranslations("os.objectiveStatus");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  await requireUser();

  const objective = await getObjective(id);
  if (!objective) notFound();

  const [company, department, companies, departments] = await Promise.all([
    getCompany(objective.company_id),
    objective.department_id ? getDepartment(objective.department_id) : null,
    listCompanies(),
    listDepartments(),
  ]);
  const deptOpts = departments.map((d) => ({
    id: d.id,
    name: d.name,
    company_id: d.company_id,
  }));

  return (
    <>
      <Link
        href="/harmony/objectives"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToObjectives")}
      </Link>

      <PageHeader title={objective.title}>
        <ObjectiveDialog
          companies={companies}
          departments={deptOpts}
          objective={objective}
        >
          <Button variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            {tc("edit")}
          </Button>
        </ObjectiveDialog>
        <ConfirmDeleteDialog
          action={deleteObjective}
          id={objective.id}
          itemTitle={objective.title}
        >
          <Button variant="outline" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
            {tc("delete")}
          </Button>
        </ConfirmDeleteDialog>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("outcomeTitle")}</CardTitle>
            <Badge variant={statusVariant[objective.status]}>
              {ts(objective.status)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {objective.outcome || t("noOutcome")}
            </p>
            <ObjectiveProgressControl
              objectiveId={objective.id}
              progress={objective.progress}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("detailsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("fields.company")}</span>
              {company ? (
                <Link
                  href={`/harmony/companies/${company.slug}`}
                  className="font-medium text-primary hover:underline"
                >
                  {company.name}
                </Link>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("fields.department")}</span>
              {department ? (
                <Link
                  href={`/harmony/departments/${department.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {department.name}
                </Link>
              ) : (
                <span>{t("noDepartment")}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("fields.dueDate")}</span>
              <span>
                {objective.due_date ? formatDate(objective.due_date, locale) : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
