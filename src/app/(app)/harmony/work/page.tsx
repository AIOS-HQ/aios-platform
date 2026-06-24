import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { AIOS_WORKFORCE, getAiosAgent } from "@/lib/workforce/registry";
import { listWorkItems, type WorkRisk, type WorkStatus } from "@/lib/workforce/work-queue";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkQueueBoard } from "@/components/harmony/workforce/work-queue-board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work");
  return { title: t("title") };
}

const STATUSES: WorkStatus[] = ["proposed", "approved", "in_progress", "done", "blocked", "dismissed"];
const RISKS: WorkRisk[] = ["routine", "approval", "destructive"];

export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; status?: string; risk?: string }>;
}) {
  const t = await getTranslations("work");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const sp = await searchParams;

  const agentFilter = getAiosAgent(sp.agent ?? "") ? sp.agent : undefined;
  const statusFilter = (STATUSES as string[]).includes(sp.status ?? "")
    ? (sp.status as WorkStatus)
    : undefined;
  const riskFilter = (RISKS as string[]).includes(sp.risk ?? "")
    ? (sp.risk as WorkRisk)
    : undefined;

  const all = await listWorkItems(user.id, {
    companyId,
    agent: agentFilter,
    status: statusFilter,
    limit: 200,
  });
  const items = riskFilter ? all.filter((i) => i.risk === riskFilter) : all;

  const board = items.map((i) => ({
    id: i.id,
    agent: i.agent,
    agentName: getAiosAgent(i.agent)?.name ?? i.agent,
    title: i.title,
    status: i.status,
    risk: i.risk,
    requiresApproval: i.requires_approval,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/approvals">{t("openApprovals")}</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {/* Filters — server-side via GET query params */}
        <Card>
          <CardContent className="p-4">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("agentLabel")}
                <select
                  name="agent"
                  defaultValue={agentFilter ?? ""}
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">{t("allAgents")}</option>
                  {AIOS_WORKFORCE.map((a) => (
                    <option key={a.key} value={a.key}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("statusLabel")}
                <select
                  name="status"
                  defaultValue={statusFilter ?? ""}
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">{t("allStatuses")}</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`status.${s}`)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("riskLabel")}
                <select
                  name="risk"
                  defaultValue={riskFilter ?? ""}
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">{t("allRisks")}</option>
                  {RISKS.map((r) => (
                    <option key={r} value={r}>{t(`risk.${r}`)}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm" variant="outline" className="h-9">
                {t("apply")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <WorkQueueBoard
              agents={AIOS_WORKFORCE.map((a) => ({ key: a.key, name: a.name }))}
              items={board}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
