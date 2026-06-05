import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listCompanies } from "@/lib/data/os/companies";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CreateCompanyDialog } from "@/components/harmony/os/create-company-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.companies");
  return { title: t("title") };
}

export default async function CompaniesPage() {
  const t = await getTranslations("os.companies");
  await requireUser();
  const companies = await listCompanies();

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <CreateCompanyDialog>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Button>
        </CreateCompanyDialog>
      </PageHeader>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <CreateCompanyDialog>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </CreateCompanyDialog>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/harmony/companies/${c.slug}`}
              className="group flex flex-col rounded-xl border p-5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-lg font-semibold">{c.name}</span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {c.description || t("noDescription")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
