import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Eye,
  Gauge,
  ListTodo,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getOversightSnapshot } from "@/lib/harmony/oversight/snapshot";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { StatTiles, type Stat } from "@/components/harmony/dashboard/stat-tiles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("oversight");
  return { title: t("metaTitle") };
}

const toneBadge: Record<string, "warning" | "default" | "secondary"> = {
  attention: "warning",
  steady: "default",
  calm: "secondary",
};

const modeLabelKey: Record<string, string> = {
  off: "automations.modeOff",
  advisory: "automations.modeAdvisory",
  bounded: "automations.modeBounded",
};

/**
 * Harmony Oversight — the founder's live supervision center. Founder/authorized
 * manager only (gated by the /harmony layout: any non-customer /harmony path is
 * founder-only). Reads a grounded operational snapshot and links into the
 * existing surfaces (comms, approvals, autonomy, workforce, activity) — it owns
 * no duplicate state.
 */
export default async function OversightPage() {
  const t = await getTranslations("oversight");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const s = await getOversightSnapshot(user.id, companyId);

  const reasons: string[] = [];
  if (s.approvals.highRisk > 0)
    reasons.push(t("health.reasons.highRisk", { count: s.approvals.highRisk }));
  if (s.work.blocked > 0)
    reasons.push(t("health.reasons.blocked", { count: s.work.blocked }));
  if (s.approvals.pending > 0)
    reasons.push(t("health.reasons.pendingApprovals", { count: s.approvals.pending }));
  if (s.pendingHarmonyResponses > 0)
    reasons.push(t("health.reasons.heldResponses", { count: s.pendingHarmonyResponses }));

  const stats: Stat[] = [
    { key: "conversations", label: t("stat.conversations"), value: s.conversations.active, icon: MessageSquare, href: "/harmony/oversight/conversations" },
    { key: "approvals", label: t("stat.approvals"), value: s.approvals.pending, icon: ShieldCheck, href: "/harmony/approvals", emphasis: true },
    { key: "escalations", label: t("stat.escalations"), value: s.escalations.length, icon: AlertTriangle, emphasis: true },
    { key: "work", label: t("stat.work"), value: s.work.inProgress, icon: ListTodo, href: "/harmony/work-items" },
    { key: "specialists", label: t("stat.specialists"), value: s.workforce.active, icon: Users, href: "/harmony/workforce" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* Harmony health / confidence summary — qualitative, grounded in the
          numbers shown below it (never a fabricated score). */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="size-4 text-primary" aria-hidden="true" />
              {t(`health.${s.health.tone}`)}
            </CardTitle>
            <Badge variant={toneBadge[s.health.tone]} className="shrink-0">
              {formatDate(s.generatedAt, locale)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.health.tone === "attention" && reasons.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t(`health.${s.health.tone}Hint`)}</p>
          )}

          {s.health.hasData && s.health.stats && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("health.statsTitle")}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([
                  ["done", s.health.stats.done],
                  ["blocked", s.health.stats.blocked],
                  ["delegations", s.health.stats.delegations],
                  ["pendingApprovals", s.health.stats.pendingApprovals],
                  ["lessons", s.health.stats.lessons],
                ] as const).map(([key, value]) => (
                  <div key={key} className="rounded-lg border bg-card p-3">
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{t(`health.stats.${key}`)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4 text-primary" aria-hidden="true" />
              {t("conversations.title")}
            </CardTitle>
            <CardDescription>{t("conversations.body")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t("conversations.active", { count: s.conversations.active })}</Badge>
              <Badge variant="outline">{t("conversations.pending", { count: s.conversations.pending })}</Badge>
              {s.pendingHarmonyResponses > 0 && (
                <Badge variant="warning">{t("conversations.held", { count: s.pendingHarmonyResponses })}</Badge>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("conversations.channels")}
              </p>
              {s.channels.kinds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("conversations.noChannels")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {s.channels.kinds.map((k) => (
                    <Badge key={k} variant="secondary">{k}</Badge>
                  ))}
                </div>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/oversight/conversations">
                {t("conversations.open")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Escalations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
              {t("escalations.title")}
            </CardTitle>
            <CardDescription>{t("escalations.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.escalations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("escalations.none")}</p>
            ) : (
              <ul className="space-y-2">
                {s.escalations.slice(0, 6).map((e) => (
                  <li key={`${e.source}-${e.id}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{e.title}</span>
                      <Badge variant={e.source === "approval" ? "warning" : "outline"} className="shrink-0">
                        {e.source === "approval" ? t("escalations.sourceApproval") : t("escalations.sourceWork")}
                      </Badge>
                    </div>
                    {e.detail && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{e.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Current AI actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              {t("actions.title")}
            </CardTitle>
            <CardDescription>{t("actions.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.recentActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("actions.none")}</p>
            ) : (
              <ul className="divide-y">
                {s.recentActions.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{a.summary}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(`actor.${a.actor}`)} · {formatDate(a.at, locale)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/activity">
                {t("actions.view")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Automations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-primary" aria-hidden="true" />
              {t("automations.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={s.automations.active ? "success" : "secondary"}>
                {s.automations.active ? t("automations.active") : t("automations.paused")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("automations.mode")}: {t(modeLabelKey[s.automations.mode])}
            </p>
            {(s.automations.killSwitch || s.automations.lockdown) && (
              <div className="flex flex-wrap gap-2">
                {s.automations.killSwitch && (
                  <Badge variant="destructive">{t("automations.killSwitch")}</Badge>
                )}
                {s.automations.lockdown && (
                  <Badge variant="destructive">{t("automations.lockdown")}</Badge>
                )}
              </div>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/autonomy">
                {t("automations.manage")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* AI Workforce */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              {t("workforce.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{t("workforce.active", { count: s.workforce.active })}</Badge>
              <Badge variant="outline">{t("workforce.paused", { count: s.workforce.paused })}</Badge>
              <Badge variant="secondary">{t("workforce.total", { count: s.workforce.total })}</Badge>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/workforce">
                {t("workforce.manage")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Work & delegations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4 text-primary" aria-hidden="true" />
              {t("work.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t("work.inProgress", { count: s.work.inProgress })}</Badge>
              <Badge variant="secondary">{t("work.delegations", { count: s.work.delegations })}</Badge>
              <Badge variant="outline">{t("work.pending", { count: s.work.pending })}</Badge>
              {s.work.blocked > 0 && (
                <Badge variant="warning">{t("work.blocked", { count: s.work.blocked })}</Badge>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/work-items">
                {t("work.manage")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
