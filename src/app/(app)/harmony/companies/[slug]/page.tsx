import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Building2, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getCompanyBySlug } from "@/lib/data/os/companies";
import { listDepartments } from "@/lib/data/os/departments";
import { listObjectives } from "@/lib/data/os/objectives";
import { listProjects } from "@/lib/data/os/projects";
import { autonomyKey, clampAutonomy } from "@/lib/harmony/os/autonomy";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DepartmentDialog } from "@/components/harmony/os/department-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  await requireUser();
  const company = await getCompanyBySlug(slug);
  return { title: company?.name ?? "Company" };
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("os.companies");
  const ta = await getTranslations("os.autonomy");
  await requireUser();

  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const [departments, objectives, projects] = await Promise.all([
    listDepartments(company.id),
    listObjectives({ companyId: company.id }),
    listProjects({ companyId: company.id }),
  ]);

  return (
    <>
      <Link
        href="/harmony/companies"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToCompanies")}
      </Link>

      <PageHeader title={company.name} description={company.description ?? undefined} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{departments.length}</p>
            <p className="text-xs text-muted-foreground">{t("stats.departments")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{objectives.length}</p>
            <p className="text-xs text-muted-foreground">{t("stats.objectives")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tabular-nums">{projects.length}</p>
            <p className="text-xs text-muted-foreground">{t("stats.projects")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            {t("departments")}
          </CardTitle>
          <DepartmentDialog companyId={company.id}>
            <Button size="sm" variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("addDepartment")}
            </Button>
          </DepartmentDialog>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDepartments")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {departments.map((d) => (
                <Link
                  key={d.id}
                  href={`/harmony/departments/${d.id}`}
                  className="group rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{d.name}</span>
                    <Badge variant="outline" className="shrink-0">
                      {ta(autonomyKey(clampAutonomy(d.autonomy_level)))}
                    </Badge>
                  </div>
                  {d.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {d.description}
                    </p>
                  )}
                  <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                    {t("manage")}
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
