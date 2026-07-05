import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users, Activity, ShieldCheck, Network, Gauge } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getWorkforceSummary } from "@/lib/workforce/summary";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { agentName } from "@/lib/workforce/relationships";
import { buildOrganizationView, orgChartTiers, type OrgWorker, type WorkerHealth } from "@/lib/workforce/org-view";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExecutiveList, ExecutiveSection, MetricTile } from "@/components/shared/executive";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org");
  return { title: t("view.title") };
}

const HEALTH_COLOR: Record<WorkerHealth, string> = {
  healthy: "#16a34a",
  busy: "#ca8a04",
  overloaded: "#dc2626",
  attention: "#d97706",
  idle: "#64748b",
};

/** Pure view-model for a worker card (all copy pre-resolved). */
interface WorkerCardVM {
  key: string;
  name: string;
  role: string;
  href: string;
  color: string;
  barPct: number;
  emphasis: boolean;
  healthLabel: string;
  loadLabel: string;
  utilLabel: string;
  tasksLabel: string;
  approvalsLabel: string | null;
  blockedLabel: string | null;
  objectiveLabel: string;
}

/** Module-scope presentational card (declared outside render). */
function WorkerCard({ vm }: { vm: WorkerCardVM }) {
  return (
    <Link
      href={vm.href}
      className={`block rounded-xl border p-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${vm.emphasis ? "border-primary/30 bg-primary/5" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{vm.name}</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: vm.color }} />
          {vm.healthLabel}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{vm.role}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${vm.barPct}%`, backgroundColor: vm.color }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{vm.loadLabel}</span>
        <span>{vm.utilLabel}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">{vm.tasksLabel}</Badge>
        {vm.approvalsLabel ? <Badge variant="default" className="text-[10px]">{vm.approvalsLabel}</Badge> : null}
        {vm.blockedLabel ? <Badge variant="destructive" className="text-[10px]">{vm.blockedLabel}</Badge> : null}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{vm.objectiveLabel}</p>
    </Link>
  );
}

export default async function WorkforceOrganizationPage() {
  const t = await getTranslations("org");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [summary, messages] = await Promise.all([
    getWorkforceSummary(user.id, companyId),
    companyId ? listAgentMessages(user.id, companyId, { limit: 200 }) : Promise.resolve([]),
  ]);

  const view = buildOrganizationView({ summary, messages });
  const { harmony, specialists } = orgChartTiers(view);
  const hasData = view.totals.activeTasks > 0 || view.commEdges.length > 0 || view.timeline.length > 0;

  const toVM = (w: OrgWorker, emphasis: boolean): WorkerCardVM => ({
    key: w.key,
    name: w.name,
    role: w.role,
    href: `/harmony/workforce/${w.key}`,
    color: HEALTH_COLOR[w.health],
    barPct: Math.min(w.capacity.utilizationPct, 100),
    emphasis,
    healthLabel: t(`view.health.${w.health}`),
    loadLabel: t("view.load", { load: w.capacity.load, capacity: w.capacity.capacity }),
    utilLabel: t("view.utilization", { pct: w.capacity.utilizationPct }),
    tasksLabel: t("view.tasks", { n: w.activeTasks }),
    approvalsLabel: w.pendingApprovals > 0 ? t("view.approvals", { n: w.pendingApprovals }) : null,
    blockedLabel: w.blocked > 0 ? t("view.blocked", { n: w.blocked }) : null,
    objectiveLabel: w.currentObjective
      ? t("view.objective", { title: w.currentObjective.title, progress: w.currentObjective.progress })
      : t("view.noObjective"),
  });

  return (
    <>
      <PageHeader title={t("view.title")} description={t("view.subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce">{t("view.back")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/harmony/workforce/org">{t("view.relationshipMap")}</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile label={t("view.metrics.workers")} value={view.totals.workers} icon={Users} tone="info" />
          <MetricTile label={t("view.metrics.activeTasks")} value={view.totals.activeTasks} icon={Activity} />
          <MetricTile label={t("view.metrics.pendingApprovals")} value={view.totals.pendingApprovals} icon={ShieldCheck} tone={view.totals.pendingApprovals > 0 ? "warning" : "info"} />
          <MetricTile label={t("view.metrics.overloaded")} value={view.totals.overloaded} icon={Gauge} tone={view.totals.overloaded > 0 ? "warning" : "success"} />
        </div>

        <ExecutiveSection icon={Users} title={t("view.orgChart")} description={t("view.orgChartHint")}>
          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="mx-auto w-full max-w-xs rounded-xl border border-foreground/20 bg-foreground/5 p-3 text-center">
                <p className="text-sm font-semibold">{t("view.founder")}</p>
                <p className="text-[11px] text-muted-foreground">{t("view.founderRole")}</p>
              </div>
              {harmony ? (
                <div className="mx-auto w-full max-w-xs">
                  <WorkerCard vm={toVM(harmony, true)} />
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {specialists.map((w) => (
                  <WorkerCard key={w.key} vm={toVM(w, false)} />
                ))}
              </div>
            </CardContent>
          </Card>
        </ExecutiveSection>

        <ExecutiveSection icon={Network} title={t("view.commFlow")} description={t("view.commFlowHint")}>
          <Card>
            <CardContent className="p-5">
              {view.commEdges.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("view.noComms")}</p>
              ) : (
                <ExecutiveList>
                  {view.commEdges.slice(0, 8).map((e) => (
                    <li key={`${e.from}>${e.to}`} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <span className="font-medium">{agentName(e.from)} → {agentName(e.to)}</span>
                      <span className="flex items-center gap-2">
                        {e.approvals > 0 ? <Badge variant="default" className="text-[10px]">{t("view.approvals", { n: e.approvals })}</Badge> : null}
                        <Badge variant="secondary">{t("view.messages", { n: e.count })}</Badge>
                      </span>
                    </li>
                  ))}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>

        <ExecutiveSection icon={Activity} title={t("view.timeline")} description={t("view.timelineHint")}>
          <Card>
            <CardContent className="p-5">
              {view.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("view.noTimeline")}</p>
              ) : (
                <ExecutiveList>
                  {view.timeline.map((ev, i) => (
                    <li key={i} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="font-medium">{agentName(ev.from)} → {agentName(ev.to)}</span>
                        <span className="ml-2 truncate text-muted-foreground">{ev.subject}</span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{ev.status}</Badge>
                    </li>
                  ))}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>

        {!hasData ? <InlineEmpty icon={Network} message={t("view.empty")} /> : null}
      </div>
    </>
  );
}
