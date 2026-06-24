import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listOpsEvents, type OpsEvent, type OpsLevel } from "@/lib/observability/ops";
import { resolveOpsEvent, resolveAllOpsEvents } from "@/lib/observability/ops-actions";
import { listAgentMessages, type AgentMessage } from "@/lib/harmony/agents/a2a";
import { getAiosAgent } from "@/lib/workforce/registry";
import { getAgentIcon } from "@/lib/workforce/agent-icons";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operations");
  return { title: t("title") };
}

const LEVEL_VARIANT: Record<OpsLevel, "default" | "secondary" | "outline" | "destructive"> = {
  error: "destructive",
  warn: "default",
  info: "secondary",
};

/** Severity ordering so errors float above warnings above info. */
const SEVERITY_RANK: Record<OpsLevel, number> = { error: 0, warn: 1, info: 2 };

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  destructive: "destructive",
  approval: "default",
  routine: "outline",
};

function OpsRow({
  e,
  locale,
  detailLabel,
  resolveLabel,
  resolvedToast,
}: {
  e: OpsEvent;
  locale: string;
  detailLabel: string;
  resolveLabel: string;
  resolvedToast: string;
}) {
  const hasContext = e.context && Object.keys(e.context).length > 0;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={LEVEL_VARIANT[e.level]} className="uppercase">{e.level}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{e.source}</span>
            <span className="text-xs text-muted-foreground">· {formatDate(e.created_at, locale)}</span>
          </div>
          <p className="text-sm">{e.message}</p>
          {hasContext && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">{detailLabel}</summary>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                {JSON.stringify(e.context, null, 2)}
              </pre>
            </details>
          )}
        </div>
        {!e.resolved && (
          <ActionButton
            action={resolveOpsEvent}
            fields={{ id: e.id }}
            size="sm"
            variant="outline"
            successMessage={resolvedToast}
          >
            {resolveLabel}
          </ActionButton>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact agent→agent row for blocked delegations and approval bottlenecks. */
function AgentMsgRow({ m, locale }: { m: AgentMessage; locale: string }) {
  const FromIcon = getAgentIcon(m.from_agent);
  const ToIcon = getAgentIcon(m.to_agent);
  const from = getAiosAgent(m.from_agent)?.name ?? m.from_agent;
  const to = getAiosAgent(m.to_agent)?.name ?? m.to_agent;
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {FromIcon ? <FromIcon className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
          {from}
          <span className="text-muted-foreground" aria-hidden="true">→</span>
          {ToIcon ? <ToIcon className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
          {to}
          <Badge variant={RISK_VARIANT[m.risk] ?? "outline"} className="text-[10px]">{m.risk}</Badge>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {formatDate(m.created_at, locale)}
          </span>
        </div>
        <p className="text-sm">{m.subject}</p>
        {m.outcome ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{m.outcome}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function OperationsPage() {
  const t = await getTranslations("operations");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [events, agentMessages] = await Promise.all([
    listOpsEvents(user.id, { limit: 100 }),
    companyId
      ? listAgentMessages(user.id, companyId, { limit: 200 })
      : Promise.resolve([] as AgentMessage[]),
  ]);

  const unresolved = events
    .filter((e) => !e.resolved)
    .sort((a, b) => SEVERITY_RANK[a.level] - SEVERITY_RANK[b.level]);
  const resolved = events.filter((e) => e.resolved).slice(0, 25);
  const errorCount = unresolved.filter((e) => e.level === "error").length;
  const warnCount = unresolved.filter((e) => e.level === "warn").length;
  const blocked = agentMessages.filter((m) => m.status === "blocked");
  const awaiting = agentMessages.filter((m) => m.status === "awaiting_approval");

  const tiles: { label: string; value: number; color: string }[] = [
    { label: t("errors"), value: errorCount, color: "#dc2626" },
    { label: t("warnings"), value: warnCount, color: "#ca8a04" },
    { label: t("blockedDelegations"), value: blocked.length, color: "#dc2626" },
    { label: t("awaitingApproval"), value: awaiting.length, color: "#2563eb" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        {unresolved.length > 0 && (
          <ActionButton
            action={resolveAllOpsEvents}
            size="sm"
            variant="outline"
            successMessage={t("resolvedAllToast")}
          >
            {t("resolveAll")}
          </ActionButton>
        )}
      </PageHeader>

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {/* ── Founder attention queue ─────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="size-4" aria-hidden="true" />
            {t("attentionQueue")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <Card key={tile.label}>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold" style={{ color: tile.value > 0 ? tile.color : undefined }}>
                    {tile.value}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tile.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Blocked delegations ─────────────────────────────────── */}
        {blocked.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {t("blockedDelegations")}
            </h2>
            <div className="flex flex-col gap-3">
              {blocked.map((m) => (
                <AgentMsgRow key={m.id} m={m} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {/* ── Approval bottlenecks ────────────────────────────────── */}
        {awaiting.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="size-4" aria-hidden="true" />
                {t("awaitingApproval")}
              </h2>
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href="/settings/approvals">{t("openApprovalCenter")}</Link>
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              {awaiting.map((m) => (
                <AgentMsgRow key={m.id} m={m} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {/* ── Operational issues (severity-ordered) ───────────────── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t("unresolved", { n: unresolved.length })}
          </h2>
          {unresolved.length === 0 ? (
            <InlineEmpty icon={CheckCircle2} message={t("allClear")} />
          ) : (
            <div className="flex flex-col gap-3">
              {unresolved.map((e) => (
                <OpsRow
                  key={e.id}
                  e={e}
                  locale={locale}
                  detailLabel={t("detail")}
                  resolveLabel={t("markResolved")}
                  resolvedToast={t("resolvedToast")}
                />
              ))}
            </div>
          )}
        </section>

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("recent")}
            </h2>
            <div className="flex flex-col gap-3 opacity-70">
              {resolved.map((e) => (
                <OpsRow
                  key={e.id}
                  e={e}
                  locale={locale}
                  detailLabel={t("detail")}
                  resolveLabel={t("markResolved")}
                  resolvedToast={t("resolvedToast")}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
