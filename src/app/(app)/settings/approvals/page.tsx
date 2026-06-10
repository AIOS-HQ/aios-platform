import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listAgentActions } from "@/lib/agent/service";
import { isAgentActionStatus } from "@/lib/agent/tools/types";
import { classifyTool } from "@/lib/agent/policy";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionControls } from "@/components/agent/action-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("approvals");
  return { title: t("title") };
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  approved: "secondary",
  executed: "default",
  rejected: "secondary",
  failed: "destructive",
  cancelled: "secondary",
};

export default async function ApprovalsPage() {
  const t = await getTranslations("approvals");
  const ts = await getTranslations("activity");
  const user = await requireUser();
  const locale = await getLocale();
  const actions = await listAgentActions(user.id, { limit: 100 });
  const pending = actions.filter((a) => a.status === "pending");
  const recent = actions.filter((a) => a.status !== "pending");

  const riskBadge = (tool: string) => {
    const r = classifyTool(tool);
    if (r === "destructive") return { label: t("riskHigh"), variant: "destructive" as const };
    if (r === "approval") return { label: t("riskApproval"), variant: "outline" as const };
    return { label: t("riskRoutine"), variant: "secondary" as const };
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8 lg:max-w-3xl">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("pendingHeading")}
          </h2>
          {pending.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={t("pendingEmpty")}
              description={t("legend")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((a) => {
                const risk = riskBadge(a.tool);
                return (
                  <Card key={a.id}>
                    <CardContent className="flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{a.tool}</span>
                          <Badge variant={risk.variant}>{risk.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("sourceLabel", { source: a.source })} ·{" "}
                          {formatDate(a.created_at, locale)}
                        </p>
                      </div>
                      <ActionControls id={a.id} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("recentHeading")}
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recentEmpty")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {recent.map((a) => {
                const risk = riskBadge(a.tool);
                return (
                  <Card key={a.id}>
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{a.tool}</span>
                          <Badge variant={risk.variant}>{risk.label}</Badge>
                          <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                            {isAgentActionStatus(a.status)
                              ? ts(`statuses.${a.status}`)
                              : a.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("sourceLabel", { source: a.source })} ·{" "}
                          {formatDate(a.created_at, locale)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-sm text-muted-foreground">{t("legend")}</p>
      </div>
    </>
  );
}
