import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Activity,
  ArrowRight,
  Building2,
  Plus,
  ShieldCheck,
  Target,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";
import { listCompanies } from "@/lib/data/os/companies";
import { listObjectives } from "@/lib/data/os/objectives";
import { countPendingApprovals } from "@/lib/data/os/approvals";
import { listActivity } from "@/lib/data/os/activity";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  StatTiles,
  type Stat,
} from "@/components/harmony/dashboard/stat-tiles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateCompanyDialog } from "@/components/harmony/os/create-company-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.commandCenter");
  return { title: t("title") };
}

export default async function CommandCenterPage() {
  const t = await getTranslations("os.commandCenter");
  const user = await requireUser();
  const locale = await getLocale();

  const [profile, companies, objectives, pendingApprovals, activity] =
    await Promise.all([
      getProfile(user.id),
      listCompanies(),
      listObjectives({ status: "active" }),
      countPendingApprovals(),
      listActivity({ limit: 8 }),
    ]);

  const name = profile?.full_name?.trim() || user.email?.split("@")[0] || "";

  if (companies.length === 0) {
    return (
      <>
        <PageHeader title={t("greeting", { name })} description={t("subtitle")} />
        <EmptyState
          icon={Building2}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <CreateCompanyDialog>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("empty.cta")}
            </Button>
          </CreateCompanyDialog>
        </EmptyState>
      </>
    );
  }

  const stats: Stat[] = [
    { key: "companies", label: t("stats.companies"), value: companies.length, icon: Building2, href: "/harmony/companies" },
    { key: "objectives", label: t("stats.objectives"), value: objectives.length, icon: Target },
    { key: "approvals", label: t("stats.approvals"), value: pendingApprovals, icon: ShieldCheck, emphasis: pendingApprovals > 0 },
  ];

  return (
    <>
      <PageHeader title={t("greeting", { name })} description={t("subtitle")} />

      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" aria-hidden="true" />
              {t("companies")}
            </CardTitle>
            <CreateCompanyDialog>
              <Button size="sm" variant="outline">
                <Plus className="size-4" aria-hidden="true" />
                {t("newCompany")}
              </Button>
            </CreateCompanyDialog>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/harmony/companies/${c.slug}`}
                  className="group rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {c.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              {t("activity")}
            </CardTitle>
            <CardDescription>{t("activityHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5">
                    <span className="text-sm">{e.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(e.created_at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
