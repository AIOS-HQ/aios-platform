import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listOpsEvents, type OpsEvent, type OpsLevel } from "@/lib/observability/ops";
import { getEventMeshOperationsSummary } from "@/lib/event-mesh/operations";
import { resolveOpsEvent, resolveAllOpsEvents } from "@/lib/observability/ops-actions";
import { listAgentMessages, type AgentMessage } from "@/lib/harmony/agents/a2a";
import { getAiosAgent } from "@/lib/workforce/registry";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { ActionButton } from "@/components/shared/action-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";

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
    <li className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
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
    </li>
  );
}

/** Compact agent→agent row for blocked delegations and approval bottlenecks. */
function AgentMsgRow({ m, locale }: { m: AgentMessage; locale: string }) {
  const from = getAiosAgent(m.from_agent)?.name ?? m.from_agent;
  const to = getAiosAgent(m.to_agent)?.name ?? m.to_agent;
  return (
    <li className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <AgentGlyph agent={m.from_agent} size="xs" />
          {from}
          <span className="text-muted-foreground" aria-hidden="true">→</span>
          <AgentGlyph agent={m.to_agent} size="xs" />
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
    </li>
  );
}

export default async function OperationsPage() {
  const t = await getTranslations("operations");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [events, agentMessages, eventMesh] = await Promise.all([
    listOpsEvents(user.id, { limit: 100 }),
    companyId
      ? listAgentMessages(user.id, companyId, { limit: 200 })
      : Promise.resolve([] as AgentMessage[]),
    getEventMeshOperationsSummary(),
  ]);

  const unresolved = events
    .filter((e) => !e.resolved)
    .sort((a, b) => SEVERITY_RANK[a.level] - SEVERITY_RANK[b.level]);
  const resolved = events.filter((e) => e.resolved).slice(0, 25);
  const errorCount = unresolved.filter((e) => e.level === "error").length;
  const warnCount = unresolved.filter((e) => e.level === "warn").length;
  const blocked = agentMessages.filter((m) => m.status === "blocked");
  const awaiting = agentMessages.filter((m) => m.status === "awaiting_approval");

  const tiles = [
    { label: t("errors"), value: errorCount, icon: AlertTriangle, tone: "danger" as const },
    { label: t("warnings"), value: warnCount, icon: Activity, tone: "warning" as const },
    { label: t("blockedDelegations"), value: blocked.length, icon: AlertTriangle, tone: "danger" as const },
    { label: t("awaitingApproval"), value: awaiting.length, icon: ShieldCheck, tone: "info" as const },
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

      <div className="flex flex-col gap-6">
        {/* ── Founder attention queue ─────────────────────────────── */}
        <ExecutiveSection icon={Activity} title={t("attentionQueue")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile) => (
              <MetricTile
                key={tile.label}
                label={tile.label}
                value={tile.value}
                icon={tile.icon}
                tone={tile.value > 0 ? tile.tone : "neutral"}
              />
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={Activity} title={t("eventMesh")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label={t("provider")} value={eventMesh.provider} icon={Activity} tone={eventMesh.status === "healthy" ? "neutral" : "warning"} />
            <MetricTile label={t("pending")} value={eventMesh.pending} icon={Activity} tone={eventMesh.pending > 0 ? "info" : "neutral"} />
            <MetricTile label={t("retries")} value={eventMesh.retries} icon={AlertTriangle} tone={eventMesh.retries > 0 ? "warning" : "neutral"} />
            <MetricTile label={t("deadLetters")} value={eventMesh.deadLetters} icon={AlertTriangle} tone={eventMesh.deadLetters > 0 ? "danger" : "neutral"} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("eventMeshStatus", {
              status: eventMesh.status,
              workers: eventMesh.workerCount,
              oldest: eventMesh.oldestPendingAt ?? "none",
            })}
          </p>
        </ExecutiveSection>

        {/* ── Blocked delegations ─────────────────────────────────── */}
        {blocked.length > 0 && (
          <ExecutiveSection icon={AlertTriangle} title={t("blockedDelegations")}>
            <ExecutiveList>
              {blocked.map((m) => (
                <AgentMsgRow key={m.id} m={m} locale={locale} />
              ))}
            </ExecutiveList>
          </ExecutiveSection>
        )}

        {/* ── Approval bottlenecks ────────────────────────────────── */}
        {awaiting.length > 0 && (
          <ExecutiveSection
            icon={ShieldCheck}
            title={t("awaitingApproval")}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/harmony/approvals">{t("openApprovalCenter")}</Link>
              </Button>
            }
          >
            <ExecutiveList>
              {awaiting.map((m) => (
                <AgentMsgRow key={m.id} m={m} locale={locale} />
              ))}
            </ExecutiveList>
          </ExecutiveSection>
        )}

        {/* ── Operational issues (severity-ordered) ───────────────── */}
        <ExecutiveSection icon={AlertTriangle} title={t("unresolved", { n: unresolved.length })}>
          {unresolved.length === 0 ? (
            <InlineEmpty icon={CheckCircle2} message={t("allClear")} />
          ) : (
            <ExecutiveList>
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
            </ExecutiveList>
          )}
        </ExecutiveSection>

        {resolved.length > 0 && (
          <ExecutiveSection icon={CheckCircle2} title={t("recent")}>
            <ExecutiveList className="opacity-75">
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
            </ExecutiveList>
          </ExecutiveSection>
        )}
      </div>
    </>
  );
}
