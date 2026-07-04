import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  MessageSquare,
  Target,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getAiosAgent } from "@/lib/workforce/registry";
import { getAgentPersona } from "@/lib/workforce/agent-personas";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { listChatMessages } from "@/lib/workforce/chat";
import { listObjectives } from "@/lib/workforce/objectives";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { getWorkforceSummary, emptyAgentSummary } from "@/lib/workforce/summary";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentChat } from "@/components/harmony/workforce/agent-chat";
import { AgentObjectives } from "@/components/harmony/workforce/agent-objectives";
import { AgentRecommendations } from "@/components/harmony/workforce/agent-recommendations";
import { AmbassadorCommsCard } from "@/components/harmony/workforce/ambassador-comms-card";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import { ExecutiveSection, MetricTile } from "@/components/shared/executive";

const ACTIVE = ["open", "delegated", "in_progress", "awaiting_approval"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agent: string }>;
}): Promise<Metadata> {
  const { agent } = await params;
  const def = getAiosAgent(agent);
  return { title: def ? `${def.name} — AIOS` : "AIOS" };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;
  const def = getAiosAgent(agent);
  const persona = getAgentPersona(agent);
  if (!def || !persona) notFound();

  const t = await getTranslations("workforce");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [messages, chat, objectives, recommendations, work] = await Promise.all([
    companyId ? listAgentMessages(user.id, companyId, { agent, limit: 100 }) : Promise.resolve([]),
    listChatMessages(user.id, agent, 100),
    listObjectives(user.id, { companyId, agent }),
    listRecommendations(user.id, { companyId, agent, status: "open" }),
    listWorkItems(user.id, { companyId, agent }),
  ]);
  const summary = (await getWorkforceSummary(user.id, companyId))[agent] ?? emptyAgentSummary();

  const queuedWork = work.filter((w) => w.status === "proposed" || w.status === "approved").length;
  const openRecs = recommendations.length;
  const pendingApprovals = messages.filter(
    (m) => m.to_agent === agent && m.status === "awaiting_approval",
  ).length;

  const sent = messages.filter((m) => m.from_agent === agent).length;
  const received = messages.filter((m) => m.to_agent === agent).length;
  const tasksCompleted = messages.filter(
    (m) => (m.from_agent === agent || m.to_agent === agent) && m.status === "completed",
  ).length;
  const connected = new Set<string>();
  for (const m of messages) {
    if (m.from_agent === agent && m.to_agent !== agent) connected.add(m.to_agent);
    if (m.to_agent === agent && m.from_agent !== agent) connected.add(m.from_agent);
  }
  const inflight = messages.find((m) => m.to_agent === agent && ACTIVE.includes(m.status));
  const lastDone = messages.find(
    (m) => (m.from_agent === agent || m.to_agent === agent) && (m.status === "completed" || m.kind === "response"),
  );
  const lastActiveTs =
    [messages[0]?.created_at, chat[chat.length - 1]?.created_at].filter(Boolean).sort().reverse()[0] ?? null;
  const status = inflight
    ? inflight.status === "awaiting_approval"
      ? "awaiting"
      : "working"
    : summary.activeObjectives > 0 || summary.queuedWork > 0 || summary.openRecommendations > 0 || pendingApprovals > 0
      ? "ready"
    : messages.length > 0 || chat.length > 0
      ? "online"
      : "idle";
  const juliusReferenced = chat.reduce((n, m) => {
    const j = (m.refs as { julius?: unknown[] } | null)?.julius;
    return n + (Array.isArray(j) ? j.length : 0);
  }, 0);

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    working: "default",
    awaiting: "destructive",
    ready: "secondary",
    online: "secondary",
    idle: "outline",
  };

  const stats: { label: string; value: number | string }[] = [
    { label: t("tasksCompleted"), value: tasksCompleted },
    { label: t("messagesSent"), value: sent },
    { label: t("messagesReceived"), value: received },
    { label: t("connectedAgents"), value: connected.size },
    { label: t("chatMessages"), value: chat.length },
    { label: t("juliusReferenced"), value: juliusReferenced },
  ];

  return (
    <>
      <PageHeader title={def.name} description={def.role}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToWorkforce")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/harmony/work?agent=${agent}`}>{t("workLink")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/review">{t("reviewQueue")}</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Identity + live status */}
        <Card className="overflow-hidden border-primary/20 glow-primary">
          <CardContent className="flex flex-col gap-4 bg-primary/5 p-5 sm:flex-row sm:items-center">
            <AgentGlyph agent={agent} size="xl" title={def.name} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{def.name}</span>
                <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{def.purpose}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {persona.focus.map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                <Badge variant="outline" className="text-[10px]">{t("queuedWork", { n: queuedWork })}</Badge>
                <Badge variant="outline" className="text-[10px]">{t("openRecs", { n: openRecs })}</Badge>
                <Badge variant={pendingApprovals > 0 ? "default" : "outline"} className="text-[10px]">
                  {t("pendingApprovals", { n: pendingApprovals })}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ambassador's Business Communications profile (renders for Ambassador only). */}
        <AmbassadorCommsCard agentKey={agent} userId={user.id} />

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label={t("currentTask")}
            value={inflight?.subject ?? t("none")}
            icon={Target}
            tone={inflight ? "info" : "neutral"}
            valueClassName="text-sm leading-6"
          />
          <MetricTile
            label={t("lastAction")}
            value={lastDone?.subject ?? t("none")}
            icon={CheckCircle2}
            tone={lastDone ? "success" : "neutral"}
            valueClassName="text-sm leading-6"
          />
          <MetricTile
            label={t("lastActive")}
            value={lastActiveTs ? formatDate(lastActiveTs, locale) : t("none")}
            icon={MessageSquare}
            valueClassName="text-sm leading-6"
          />
        </div>

        {/* Metrics */}
        <ExecutiveSection title={t("metrics")}>
          <Card>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-background p-4 shadow-[var(--shadow-soft)]">
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
            </CardContent>
          </Card>
        </ExecutiveSection>

        {/* Objectives */}
        <ExecutiveSection
          icon={Target}
          title={t("objectives")}
          description={t("objectivesHint")}
        >
          <Card>
            <CardContent className="p-5">
            <AgentObjectives
              agent={agent}
              objectives={objectives.map((o) => ({
                id: o.id,
                title: o.title,
                status: o.status,
                priority: o.priority,
                origin: o.origin,
                progress: o.progress,
              }))}
            />
            </CardContent>
          </Card>
        </ExecutiveSection>

        {/* Recommendations */}
        <ExecutiveSection
          icon={Lightbulb}
          title={t("recommendations")}
          description={t("recommendationsHint")}
        >
          <Card>
            <CardContent className="p-5">
            <AgentRecommendations
              recommendations={recommendations.map((r) => ({
                id: r.id,
                agent: r.agent,
                agentName: def.name,
                title: r.title,
                detail: r.detail,
                rationale: r.rationale,
                status: r.status,
              }))}
            />
            </CardContent>
          </Card>
        </ExecutiveSection>

        {/* Chat */}
        <ExecutiveSection
          icon={MessageSquare}
          title={t("chatWith", { name: def.name })}
          description={t("chatHint")}
        >
          <Card>
            <CardContent className="p-5">
            <AgentChat
              agent={agent}
              agentName={def.name}
              messages={chat.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
            />
            </CardContent>
          </Card>
        </ExecutiveSection>
      </div>
    </>
  );
}
