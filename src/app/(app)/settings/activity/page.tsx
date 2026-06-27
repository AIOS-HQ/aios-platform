import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { History } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listAgentActions } from "@/lib/agent/service";
import { isAgentActionStatus } from "@/lib/agent/tools/types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ActionControls } from "@/components/agent/action-controls";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activity");
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

export default async function ActivityPage() {
  const t = await getTranslations("activity");
  const user = await requireUser();
  const locale = await getLocale();
  const actions = await listAgentActions(user.id, { limit: 100 });
  const pending = actions.filter((a) => a.status === "pending").length;
  const failed = actions.filter((a) => a.status === "failed").length;
  const executed = actions.filter((a) => a.status === "executed").length;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6">
        {actions.length === 0 ? (
          <EmptyState
            icon={History}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label={t("statuses.pending")}
                value={pending}
                icon={History}
                tone={pending > 0 ? "warning" : "neutral"}
              />
              <MetricTile
                label={t("statuses.executed")}
                value={executed}
                icon={History}
                tone="success"
              />
              <MetricTile
                label={t("statuses.failed")}
                value={failed}
                icon={History}
                tone={failed > 0 ? "danger" : "neutral"}
              />
            </div>
            <ExecutiveSection icon={History} title={t("title")}>
              <ExecutiveList>
            {actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{a.tool}</span>
                      <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                        {isAgentActionStatus(a.status)
                          ? t(`statuses.${a.status}`)
                          : a.status}
                      </Badge>
                    </div>
                    {a.error ? (
                      <p className="text-sm text-destructive">
                        {t("errorLabel", { error: a.error })}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t("sourceLabel", { source: a.source })} ·{" "}
                      {formatDate(a.created_at, locale)}
                    </p>
                  </div>
                  {a.status === "pending" ? <ActionControls id={a.id} /> : null}
              </li>
            ))}
              </ExecutiveList>
            </ExecutiveSection>
          </>
        )}
      </div>
    </>
  );
}
