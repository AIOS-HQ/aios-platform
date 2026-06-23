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
import { listDepartments } from "@/lib/data/os/departments";
import { listObjectives, countObjectives } from "@/lib/data/os/objectives";
import { countWorkItems } from "@/lib/data/os/work-items";
import { getConnections } from "@/lib/integrations/connections";
import { CONNECTORS } from "@/lib/integrations/connectors";
import { getConnectorStatus } from "@/lib/integrations/connector-config";
import {
  countPendingApprovals,
  countDecidedApprovals,
} from "@/lib/data/os/approvals";
import { listActivity } from "@/lib/data/os/activity";
import { DOMAINS, getDepartmentTemplate } from "@/lib/harmony/os/catalog";
import {
  buildOnboardingSteps,
  onboardingComplete,
} from "@/lib/harmony/os/onboarding";
import { formatDate } from "@/lib/format";
import { Sparkles } from "lucide-react";
import { HarmonyDelegateDialog } from "@/components/harmony/os/harmony-delegate-dialog";
import { FirstRunChecklist } from "@/components/harmony/os/first-run-checklist";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEmpty } from "@/components/shared/inline-empty";
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
import { CommandCenter } from "@/components/harmony/command-center/command-center";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.commandCenter");
  return { title: t("title") };
}

export default async function CommandCenterPage() {
  const t = await getTranslations("os.commandCenter");
  const td = await getTranslations("os.domains");
  const user = await requireUser();
  const locale = await getLocale();

  const [
    profile,
    companies,
    departments,
    objectives,
    pendingApprovals,
    activity,
    objectivesTotal,
    workTotal,
    decidedApprovals,
    blockedWork,
    connections,
  ] = await Promise.all([
    getProfile(user.id),
    listCompanies(),
    listDepartments(),
    listObjectives({ status: "active" }),
    countPendingApprovals(),
    listActivity({ limit: 8 }),
    countObjectives(),
    countWorkItems(),
    countDecidedApprovals(),
    countWorkItems("blocked"),
    getConnections(user.id),
  ]);
  // Founder connector health for the cockpit (authorizable connectors only).
  const connByProvider = new Map(connections.map((c) => [c.provider, c]));
  const connectors = CONNECTORS.filter((c) => c.authorizable).map((c) => ({
    id: c.id,
    name: c.name,
    status: getConnectorStatus(c, connByProvider.get(c.id)),
    account: connByProvider.get(c.id)?.external_account ?? null,
  }));
  const deptOpts = departments.map((d) => ({
    id: d.id,
    name: d.name,
    company_id: d.company_id,
  }));
  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));

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

  // First-run checklist — derived from real state (auto-hides once complete).
  const autonomyConfigured = departments.some((d) => {
    const tpl = getDepartmentTemplate(d.key);
    return tpl ? d.autonomy_level !== tpl.defaultAutonomy : false;
  });
  const onboardingSteps = buildOnboardingSteps({
    hasCompany: companies.length > 0,
    hasDepartment: departments.length > 0,
    autonomyConfigured,
    hasObjective: objectivesTotal > 0,
    hasWork: workTotal > 0,
    approvalReviewed: decidedApprovals > 0,
  });

  return (
    <>
      <PageHeader title={t("greeting", { name })} description={t("subtitle")}>
        <HarmonyDelegateDialog companies={companyOpts} objectives={objectives.map((o) => ({ id: o.id, name: o.title }))} departments={deptOpts}>
          <Button>
            <Sparkles className="size-4" aria-hidden="true" />
            {t("delegate")}
          </Button>
        </HarmonyDelegateDialog>
      </PageHeader>

      <StatTiles stats={stats} />

      {!onboardingComplete(onboardingSteps) && (
        <FirstRunChecklist
          steps={onboardingSteps}
          firstDepartmentId={departments[0]?.id}
        />
      )}

      <CommandCenter
        userId={user.id}
        companyId={companies[0]?.id ?? null}
        objectives={objectives.map((o) => ({ id: o.id, title: o.title }))}
        pendingApprovals={pendingApprovals}
        activity={activity.map((e) => ({
          id: e.id,
          summary: e.summary,
          created_at: e.created_at,
        }))}
        objectivesTotal={objectivesTotal}
        workTotal={workTotal}
        decidedApprovals={decidedApprovals}
        blockedWork={blockedWork}
        connectors={connectors}
      />

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
          <CardContent className="space-y-4">
            {DOMAINS.filter((d) => companies.some((c) => c.domain === d)).map(
              (d) => (
                <div key={d}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {td(d)}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {companies
                      .filter((c) => c.domain === d)
                      .map((c) => (
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
                </div>
              ),
            )}
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
              <InlineEmpty icon={Activity} message={t("noActivity")} />
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
