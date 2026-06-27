import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Activity,
  Brain,
  ListChecks,
  ListTodo,
  Network,
  Send,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import {
  AIOS_WORKFORCE,
  WORKFORCE_SPECIALISTS,
  getAiosAgent,
  getHarmony,
} from "@/lib/workforce/registry";
import { getWorkforceSummary, emptyAgentSummary } from "@/lib/workforce/summary";
import { resolvePrimaryCompanyId, getJuliusAwareness } from "@/lib/julius/wiring";
import { listAgentMessages, type AgentMessage } from "@/lib/harmony/agents/a2a";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { AgentDispatchDialog } from "@/components/harmony/workforce/agent-dispatch-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workforce");
  return { title: t("title") };
}

type AgentStatus = "working" | "awaiting" | "online" | "idle";

const STATUS_VARIANT: Record<AgentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  working: "default",
  awaiting: "destructive",
  online: "secondary",
  idle: "outline",
};

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  destructive: "destructive",
  approval: "default",
  routine: "outline",
};

const ACTIVE = ["open", "delegated", "in_progress", "awaiting_approval"];

/** Derive a live status for an agent from its recent agent-to-agent messages. */
function deriveState(key: string, messages: AgentMessage[]) {
  const mine = messages.filter((m) => m.from_agent === key || m.to_agent === key);
  const inflight = messages.find(
    (m) => m.to_agent === key && ACTIVE.includes(m.status),
  );
  const lastDone = messages.find(
    (m) =>
      (m.from_agent === key || m.to_agent === key) &&
      (m.status === "completed" || m.kind === "response"),
  );
  let status: AgentStatus = "idle";
  if (inflight) status = inflight.status === "awaiting_approval" ? "awaiting" : "working";
  else if (mine.length > 0) status = "online";
  return {
    status,
    currentTask: inflight?.subject ?? null,
    lastAction: lastDone?.subject ?? null,
    lastActive: mine[0]?.created_at ?? null,
  };
}

export default async function WorkforcePage() {
  const t = await getTranslations("workforce");
  const tJulius = await getTranslations("julius");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [messages, awareness, summary] = await Promise.all([
    companyId ? listAgentMessages(user.id, companyId, { limit: 60 }) : Promise.resolve([]),
    companyId
      ? getJuliusAwareness(user.id, companyId)
      : Promise.resolve({ objectives: [], decisions: [], activities: [], knowledge: [], total: 0 }),
    getWorkforceSummary(user.id, companyId),
  ]);

  // Pending approvals per agent (inbound, awaiting the founder).
  const approvalsByAgent: Record<string, number> = {};
  for (const m of messages) {
    if (m.status === "awaiting_approval") {
      approvalsByAgent[m.to_agent] = (approvalsByAgent[m.to_agent] ?? 0) + 1;
    }
  }

  // Harmony — the AI Chief of Staff — coordinates the specialists below.
  const harmony = getHarmony();
  const specialistStates = WORKFORCE_SPECIALISTS.map((agent) => ({
    agent,
    state: deriveState(agent.key, messages),
  }));
  const workingAgents = specialistStates.filter(({ state }) => state.status === "working").length;
  const pendingApprovals = Object.values(approvalsByAgent).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Button asChild variant="outline">
          <Link href="/harmony/workforce/graph">
            <Network className="size-4" aria-hidden="true" />
            {t("relationshipGraph")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/harmony/work">
            <ListChecks className="size-4" aria-hidden="true" />
            {t("workQueue")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/harmony/review">
            <ListTodo className="size-4" aria-hidden="true" />
            {t("reviewQueue")}
          </Link>
        </Button>
        <AgentDispatchDialog
          agents={AIOS_WORKFORCE.map((a) => ({ key: a.key, name: a.name }))}
        >
          <Button>
            <Send className="size-4" aria-hidden="true" />
            {t("dispatch")}
          </Button>
        </AgentDispatchDialog>
      </PageHeader>

      <div className="flex flex-col gap-8">
        {/* ── Workforce Directory + Status Board ─────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label={t("specialists")}
            value={WORKFORCE_SPECIALISTS.length}
            icon={Users}
            detail={t("directory")}
          />
          <MetricTile
            label={t("status.working")}
            value={workingAgents}
            icon={Activity}
            tone={workingAgents > 0 ? "success" : "neutral"}
            detail={t("currentTask")}
          />
          <MetricTile
            label={t("pendingApprovals", { n: pendingApprovals })}
            value={pendingApprovals}
            icon={ListTodo}
            tone={pendingApprovals > 0 ? "warning" : "neutral"}
            detail={t("reviewQueue")}
          />
          <MetricTile
            label={t("brain")}
            value={awareness.total}
            icon={Brain}
            tone="info"
            detail={t("juliusEntries", { n: awareness.total })}
          />
        </div>

        <ExecutiveSection
          icon={Users}
          title={t("directory")}
          description={t("coordinatorHint")}
        >
          {/* Harmony — the AI Chief of Staff — coordinates the specialists below. */}
          <Card className="mb-4 overflow-hidden border-primary/40 bg-primary/5">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <AgentGlyph
                agent="harmony"
                size="lg"
                className="border-primary/40 bg-primary/10 text-primary"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight">{harmony.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("coordinatorHint")}
                </p>
              </div>
              <Badge className="shrink-0 sm:ml-auto">{t("coordinator")}</Badge>
            </CardContent>
          </Card>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            {t("specialists")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Julius — the AIOS company brain, not a workforce agent. Clickable
                destination: the Company Brain (org memory + the workforce around it). */}
            <Link href="/harmony/julius" className="block">
              <Card className="h-full border-primary/30 transition-colors hover:border-primary/50 hover:bg-primary/10">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <AgentGlyph
                      agent="julius"
                      size="lg"
                      className="border-primary/40 bg-primary/10 text-primary"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">Julius</p>
                      <p className="truncate text-xs text-muted-foreground">{t("brainRole")}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto">{t("brain")}</Badge>
                  </div>
                  <p className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("juliusEntries", { n: awareness.total })}</span>
                    <span className="font-medium text-primary">{tJulius("openBrain")} →</span>
                  </p>
                </CardContent>
              </Card>
            </Link>

            {specialistStates.map(({ agent: a, state: s }) => {
              const sum = summary[a.key] ?? emptyAgentSummary();
              const agentPendingApprovals = approvalsByAgent[a.key] ?? 0;
              return (
                <Card key={a.key} className="h-full overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <AgentGlyph
                        agent={a.key}
                        size="lg"
                        className="border-2 bg-muted text-foreground"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.role}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[s.status]} className="ml-auto shrink-0">
                        {t(`status.${s.status}`)}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("currentTask")}</dt>
                        <dd className="min-w-0 truncate">{s.currentTask ?? t("none")}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("lastAction")}</dt>
                        <dd className="min-w-0 truncate">{s.lastAction ?? t("none")}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("lastActive")}</dt>
                        <dd className="min-w-0 truncate">
                          {s.lastActive ? formatDate(s.lastActive, locale) : t("none")}
                        </dd>
                      </div>
                    </dl>
                    {/* Phase 7 — what this agent is responsible for */}
                    <div className="mt-3 rounded-md bg-muted/50 p-2">
                      <p className="truncate text-xs">
                        <span className="text-muted-foreground">{t("objective")}: </span>
                        {sum.currentObjective ? sum.currentObjective.title : t("none")}
                      </p>
                      {sum.currentObjective ? (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${sum.currentObjective.progress}%` }}
                          />
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">{t("queuedWork", { n: sum.queuedWork })}</Badge>
                        <Badge variant="outline" className="text-[10px]">{t("openRecs", { n: sum.openRecommendations })}</Badge>
                        <Badge
                          variant={agentPendingApprovals > 0 ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {t("pendingApprovals", { n: agentPendingApprovals })}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <Link href={`/harmony/workforce/${a.key}`}>{t("viewProfile")}</Link>
                      </Button>
                      <Button asChild size="sm" className="h-7 px-2 text-xs">
                        <Link href={`/harmony/workforce/${a.key}`}>{t("openChat")}</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link href={`/harmony/work?agent=${a.key}`}>{t("workLink")}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ExecutiveSection>

        {/* ── Agent Communications (A2A activity feed) ───────────────────── */}
        <ExecutiveSection
          icon={Activity}
          title={t("activity")}
          description={t("activityHint")}
        >
          <Card>
            <CardContent className="p-5">
              {messages.length === 0 ? (
                <InlineEmpty icon={Activity} message={t("noActivity")} />
              ) : (
                <ExecutiveList>
                  {messages.map((m) => {
                    const from = getAiosAgent(m.from_agent)?.name ?? m.from_agent;
                    const to = getAiosAgent(m.to_agent)?.name ?? m.to_agent;
                    const ctx = Array.isArray(
                      (m.context as { julius?: unknown[] } | null)?.julius,
                    )
                      ? ((m.context as { julius: unknown[] }).julius.length as number)
                      : 0;
                    return (
                      <li key={m.id} className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <AgentGlyph agent={m.from_agent} size="xs" />
                            {from}
                            <span className="text-muted-foreground" aria-hidden="true">→</span>
                            <AgentGlyph agent={m.to_agent} size="xs" />
                            {to}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {t(`kind.${m.kind}`)}
                          </Badge>
                          <Badge variant={RISK_VARIANT[m.risk] ?? "outline"} className="text-[10px]">
                            {t(`risk.${m.risk}`)}
                          </Badge>
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {m.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm">{m.subject}</p>
                        {m.outcome && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {t("outcomeLabel")}: {m.outcome}
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(m.created_at, locale)}</span>
                          {ctx > 0 && <span>· {t("ctx", { n: ctx })}</span>}
                        </p>
                      </li>
                    );
                  })}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>
      </div>
    </>
  );
}
