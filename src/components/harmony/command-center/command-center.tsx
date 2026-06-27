import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Brain,
  GitBranch,
  Library,
  Network,
  Plug,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import {
  buildHarmonyExecutiveIntelligence,
  type ExecutiveRecommendation,
} from "@/lib/harmony/executive-intelligence";
import { AIOS_WORKFORCE, AGENT_CONNECTORS, getAiosAgent } from "@/lib/workforce/registry";
import { getConnector } from "@/lib/integrations/connectors";
import { formatDate, formatDateTime } from "@/lib/format";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import {
  ExecutiveList,
  ExecutiveSection,
  SignalPill,
} from "@/components/shared/executive";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface CommandCenterProps {
  userId: string;
  companyId: string | null;
}

const REC_VARIANT: Record<
  ExecutiveRecommendation["priority"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const POSTURE_VARIANT = {
  ok: "success",
  info: "secondary",
  warn: "default",
  risk: "destructive",
} as const;

const DOMAIN_AGENT: Record<string, string> = {
  approvals: "ledger",
  configuration: "pulse",
  deployment: "pulse",
  governance: "ledger",
  risk: "aegis",
  security: "aegis",
  workflow: "auditor",
};

function agentName(key: string): string {
  return getAiosAgent(key)?.name ?? key;
}

function recValues(rec: ExecutiveRecommendation) {
  return {
    n: rec.title,
    title: rec.title,
    detail: rec.detail,
    agent: agentName(rec.agent),
  };
}

/**
 * Founder Command Center sections — Harmony's executive operator read.
 * Reuses Auditor, Julius, connector health, A2A, work queue, objectives, and
 * recommendations through a single server-side synthesis module.
 */
export async function CommandCenter({ userId, companyId }: CommandCenterProps) {
  const t = await getTranslations("commandCenter");
  const tConn = await getTranslations("connections");
  const locale = await getLocale();
  const intel = await buildHarmonyExecutiveIntelligence(userId, companyId);
  const generatedAt = formatDateTime(intel.generatedAt, locale);

  const headlineTone =
    intel.situation === "critical"
      ? "danger"
      : intel.situation === "attention"
        ? "warning"
        : intel.situation === "operating"
          ? "success"
          : "neutral";

  return (
    <div className="flex flex-col gap-6">
      <Card className={intel.situation === "critical" ? "border-destructive/40" : undefined}>
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <AgentGlyph
                agent="harmony"
                size="lg"
                className="border-primary/30 bg-primary/10 text-primary"
              />
              <div className="space-y-1">
                <SignalPill tone={headlineTone}>{t(`intel.state.${intel.headline.key}`)}</SignalPill>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t(`intel.headline.${intel.headline.key}`, {
                    n: intel.headline.primaryCount,
                  })}
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t("intel.operatorRead", {
                    agents: intel.metrics.activeAgents,
                    work: intel.metrics.activeWork,
                    approvals: intel.metrics.pendingApprovals,
                    risks: intel.auditor.risks.length,
                    context: intel.metrics.juliusContext,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">{t("asOf", { time: generatedAt })}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={intel.recommendations[0]?.href ?? "/harmony/workforce"}>
                  {t("intel.topAction")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/harmony/briefing">{t("intel.fullBriefing")}</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [t("intel.metrics.activeWork"), intel.metrics.activeWork],
              [t("intel.metrics.approvals"), intel.metrics.pendingApprovals],
              [t("intel.metrics.blocked"), intel.metrics.blockedWork],
              [t("intel.metrics.agents"), intel.metrics.activeAgents],
              [t("intel.metrics.skills"), intel.skills.metrics.total],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-background/70 p-3">
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <ExecutiveSection
          icon={Sparkles}
          title={t("recommendations")}
          description={t("recommendationsHint")}
        >
          <ExecutiveList>
            {intel.recommendations.map((rec) => (
              <li key={rec.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={REC_VARIANT[rec.priority]}>
                      {t(`intel.priority.${rec.priority}`)}
                    </Badge>
                    <AgentGlyph agent={rec.agent} size="xs" />
                    <span className="text-sm font-semibold">{agentName(rec.agent)}</span>
                  </div>
                  <p className="text-sm">
                    {t(`intel.recommendation.${rec.kind}`, recValues(rec))}
                  </p>
                  {rec.detail ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{rec.detail}</p>
                  ) : null}
                  {rec.skillsUsed?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {rec.skillsUsed.slice(0, 2).map((skill) => (
                        <Badge key={skill.source_entry_id} variant="outline" className="text-[10px]">
                          {t("intel.skills.used", {
                            title: skill.title,
                            confidence: skill.confidence_score,
                          })}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={rec.href}>{t("review")}</Link>
                </Button>
              </li>
            ))}
          </ExecutiveList>
        </ExecutiveSection>

        <ExecutiveSection
          icon={GitBranch}
          title={t("intel.delegation.title")}
          description={t("intel.delegation.description")}
        >
          {intel.delegationRoutes.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                {t("intel.delegation.none")}
              </CardContent>
            </Card>
          ) : (
            <ExecutiveList>
              {intel.delegationRoutes.map((route) => (
                <li key={route.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AgentGlyph agent={route.agent} size="xs" />
                    <span className="text-sm font-semibold">{agentName(route.agent)}</span>
                    <Badge variant="outline">{t(`intel.routeSource.${route.source}`)}</Badge>
                    <Badge variant={route.confidence === "high" ? "default" : "secondary"}>
                      {t(`intel.confidence.${route.confidence}`)}
                    </Badge>
                  </div>
                  <p className="text-sm">{route.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("intel.delegation.load", { n: route.load })}
                  </p>
                </li>
              ))}
            </ExecutiveList>
          )}
        </ExecutiveSection>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveSection
          icon={ShieldAlert}
          title={t("riskOverview")}
          description={intel.auditor.report.summary}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/auditor">{t("openAuditor")}</Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{intel.auditor.report.score}</span>
                <span className="text-sm text-muted-foreground">{t("riskScoreSuffix")}</span>
                <Badge
                  variant={POSTURE_VARIANT[intel.auditor.report.posture]}
                  className="ml-auto"
                >
                  {t(`posture.${intel.auditor.report.posture}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="destructive">{t("sev.risk", { n: intel.auditor.report.counts.risk })}</Badge>
                <Badge variant="default">{t("sev.warn", { n: intel.auditor.report.counts.warn })}</Badge>
                <Badge variant="outline">{t("sev.info", { n: intel.auditor.report.counts.info })}</Badge>
                <Badge variant="secondary">{t("sev.ok", { n: intel.auditor.report.counts.ok })}</Badge>
              </div>
              <ExecutiveList>
                {intel.auditor.frequencyByDomain.slice(0, 5).map((domain) => (
                  <li key={domain.domain} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="flex items-center gap-2">
                      <AgentGlyph agent={DOMAIN_AGENT[domain.domain] ?? "auditor"} size="xs" />
                      {t("intel.auditorDomain", { domain: domain.domain })}
                    </span>
                    <Badge variant={REC_VARIANT[domain.highest]}>{domain.count}</Badge>
                  </li>
                ))}
              </ExecutiveList>
            </CardContent>
          </Card>
        </ExecutiveSection>

        <ExecutiveSection
          icon={Library}
          title={t("intel.skills.title")}
          description={t("intel.skills.description", {
            n: intel.skills.metrics.total,
            recent: intel.skills.metrics.recentlyLearned,
          })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/harmony/julius">{t("intel.julius.open")}</Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-background/70 p-3">
                  <p className="text-xl font-semibold">{intel.skills.metrics.highestConfidence}</p>
                  <p className="text-xs text-muted-foreground">{t("intel.skills.highest")}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-3">
                  <p className="text-xl font-semibold">{intel.skills.metrics.fastestGrowingDomain ?? t("none")}</p>
                  <p className="text-xs text-muted-foreground">{t("intel.skills.domain")}</p>
                </div>
              </div>
              {intel.skills.relevant.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("intel.skills.none")}</p>
              ) : (
                <ExecutiveList>
                  {intel.skills.relevant.slice(0, 4).map((skill) => (
                    <li key={skill.source_entry_id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <AgentGlyph agent={skill.owner_agent} size="xs" />
                        <span className="text-sm font-semibold">{skill.title}</span>
                        <Badge variant="outline">{skill.confidence_score}/100</Badge>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {skill.summary}
                      </p>
                    </li>
                  ))}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>

        <ExecutiveSection
          icon={Network}
          title={t("intel.organization.title")}
          description={t("intel.organization.description", {
            collaborations: intel.organization.metrics.collaborations,
            reliability: intel.organization.strongestCollaboration?.reliability ?? 0,
          })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/harmony/workforce">{t("intel.organization.open")}</Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-background/70 p-3">
                  <p className="text-xl font-semibold">
                    {intel.organization.metrics.averageCompletionHours ?? t("none")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("intel.organization.avgTime")}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-3">
                  <p className="text-xl font-semibold">
                    {intel.organization.metrics.approvalFrequency}%
                  </p>
                  <p className="text-xs text-muted-foreground">{t("intel.organization.approvals")}</p>
                </div>
              </div>
              {intel.organization.strongestCollaboration ? (
                <div className="space-y-2 rounded-lg border bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t("intel.organization.strongest")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {intel.organization.strongestCollaboration.agents.map((agent) => (
                      <AgentGlyph key={agent} agent={agent} size="xs" />
                    ))}
                    <span className="text-sm font-semibold">
                      {intel.organization.strongestCollaboration.label}
                    </span>
                    <Badge variant="outline">
                      {intel.organization.strongestCollaboration.reliability}%
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("intel.organization.none")}</p>
              )}
              {intel.organization.bottlenecks[0] ? (
                <p className="text-xs text-muted-foreground">
                  {t("intel.organization.bottleneck", {
                    title: intel.organization.bottlenecks[0].title,
                    count: intel.organization.bottlenecks[0].count,
                  })}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </ExecutiveSection>

        <ExecutiveSection
          icon={Brain}
          title={t("intel.julius.title")}
          description={t("intel.julius.description", { n: intel.julius.total })}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/harmony/julius">{t("intel.julius.open")}</Link>
            </Button>
          }
        >
          <Card>
            <CardContent className="p-5">
              {intel.julius.lessons.length === 0 && intel.julius.decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("intel.julius.none")}</p>
              ) : (
                <ExecutiveList>
                  {[...intel.julius.decisions, ...intel.julius.lessons].slice(0, 5).map((entry) => (
                    <li key={entry.id} className="space-y-1 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <AgentGlyph agent={entry.agent} size="xs" />
                        <span className="text-sm font-semibold">{entry.title}</span>
                        <Badge variant="outline">{entry.kind}</Badge>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {entry.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.created_at, locale)}
                      </p>
                    </li>
                  ))}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>
      </div>

      <ExecutiveSection
        icon={Users}
        title={t("agentHealth")}
        description={t("agentHealthHint")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AIOS_WORKFORCE.map((agent) => {
            const signal = intel.workforce.find((w) => w.agent === agent.key);
            return (
              <Card key={agent.key}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <AgentGlyph agent={agent.key} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{agent.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {t("intel.agentSignal.active", { n: signal?.activeWork ?? 0 })}
                    </Badge>
                    <Badge
                      variant={(signal?.blockedWork ?? 0) > 0 ? "destructive" : "outline"}
                      className="text-[10px]"
                    >
                      {t("intel.agentSignal.blocked", { n: signal?.blockedWork ?? 0 })}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t("contributions", { n: signal?.juliusEntries ?? 0 })}
                    </Badge>
                  </div>
                  {agent.julius === "steward" ? (
                    <p className="text-xs text-primary">{t("juliusSteward")}</p>
                  ) : null}
                  {(AGENT_CONNECTORS[agent.key] ?? []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {(AGENT_CONNECTORS[agent.key] ?? []).map((cid) => {
                        const conn = getConnector(cid);
                        return conn ? (
                          <Badge key={cid} variant="outline" className="text-[10px]">
                            {conn.initials}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ExecutiveSection>

      {intel.connectors.length > 0 ? (
        <ExecutiveSection
          icon={Plug}
          title={t("connectors")}
          description={t("connectorsHint")}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {intel.connectors.map((connector) => (
              <Card key={connector.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{connector.name}</span>
                    <Badge
                      variant={
                        connector.status === "connected"
                          ? "success"
                          : connector.status === "expired"
                            ? "destructive"
                            : connector.status === "ready"
                              ? "outline"
                              : "secondary"
                      }
                    >
                      {tConn(`status.${connector.status}`)}
                    </Badge>
                  </div>
                  {connector.account ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {tConn("accountLabel", { account: connector.account })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </ExecutiveSection>
      ) : null}
    </div>
  );
}
