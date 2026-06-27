import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, Activity, Ban, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { reflectAfterEvent } from "@/lib/harmony/reflection";
import { getAiosAgent } from "@/lib/workforce/registry";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { listObjectives } from "@/lib/workforce/objectives";
import { listAutonomyAudit } from "@/lib/workforce/autonomy";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { buildHarmonyExecutiveIntelligence } from "@/lib/harmony/executive-intelligence";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";

const DECISION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  auto_executed: "default",
  notified: "secondary",
  pending_approval: "outline",
  denied: "destructive",
  kill_switch: "destructive",
  lockdown: "destructive",
};
const BLOCKED_DECISIONS = ["denied", "kill_switch", "lockdown"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("briefing");
  return { title: t("title") };
}

export default async function FounderBriefingPage() {
  const t = await getTranslations("briefing");
  const ta = await getTranslations("autonomy");
  const tc = await getTranslations("commandCenter");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  // Reflect before briefing: if meaningful execution has occurred since the last
  // reflection, enrich Julius first (signature-deduped — a no-op when nothing
  // meaningful changed), so the briefing is generated against current
  // organizational memory. Fail-open by design (never blocks the briefing).
  if (companyId) {
    await reflectAfterEvent(user.id, companyId, "before_briefing");
  }

  const [audit, work, recs, objectives, messages, intelligence] = await Promise.all([
    listAutonomyAudit(user.id, 200),
    listWorkItems(user.id, { companyId, limit: 300 }),
    listRecommendations(user.id, { companyId, limit: 300 }),
    listObjectives(user.id, { companyId, limit: 300 }),
    companyId ? listAgentMessages(user.id, companyId, { limit: 200 }) : Promise.resolve([]),
    buildHarmonyExecutiveIntelligence(user.id, companyId),
  ]);

  const agentName = (k: string) => getAiosAgent(k)?.name ?? k;

  // COMPLETED — grouped by agent
  const completed = work.filter((w) => w.status === "done");
  const completedByAgent: Record<string, string[]> = {};
  for (const w of completed) (completedByAgent[w.agent] ??= []).push(w.title);
  const acceptedRecs = recs.filter((r) => r.status === "accepted").length;
  const autoExecuted = audit.filter((a) => a.decision === "auto_executed" || a.decision === "notified").length;

  // ATTEMPTED — autonomy decisions + delegations
  const delegations = messages.filter((m) => m.kind === "task" || m.kind === "response").length;

  // BLOCKED — denied / kill / lockdown + blocked work
  const blocked = audit.filter((a) => BLOCKED_DECISIONS.includes(a.decision));
  const blockedWork = work.filter((w) => w.status === "blocked");

  // WAITING — founder attention queue
  const pendingApprovals = messages.filter((m) => m.status === "awaiting_approval");
  const proposedWork = work.filter((w) => w.status === "proposed");
  const openRecs = recs.filter((r) => r.status === "open");
  const proposedObjectives = objectives.filter((o) => o.status === "proposed");
  const waitingTotal = pendingApprovals.length + proposedWork.length + openRecs.length + proposedObjectives.length;

  // WHY — recent important decisions
  const why = audit.slice(0, 15);

  const tiles = [
    { label: t("statCompleted"), value: completed.length + acceptedRecs },
    { label: t("statAttempted"), value: audit.length },
    { label: t("statBlocked"), value: blocked.length + blockedWork.length, danger: blocked.length + blockedWork.length > 0 },
    { label: t("statWaiting"), value: waitingTotal, emphasis: waitingTotal > 0 },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-4xl">
        {/* Executive tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label}>
              <CardContent className="p-4">
                <p className={`text-xl font-bold ${tile.danger ? "text-destructive" : ""}`}>{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" aria-hidden="true" />
              {tc("recommendations")}
            </CardTitle>
            <CardDescription>
              {tc(`intel.headline.${intelligence.headline.key}`, {
                n: intelligence.headline.primaryCount,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {intelligence.recommendations.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.priority === "critical" ? "destructive" : r.priority === "high" ? "default" : "outline"}>
                        {tc(`intel.priority.${r.priority}`)}
                      </Badge>
                      <AgentGlyph agent={r.agent} size="xs" />
                      <span className="text-sm font-medium">{agentName(r.agent)}</span>
                    </div>
                    <p className="text-sm">
                      {tc(`intel.recommendation.${r.kind}`, {
                        n: r.title,
                        title: r.title,
                        detail: r.detail,
                        agent: agentName(r.agent),
                      })}
                    </p>
                    {r.detail ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{r.detail}</p>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={r.href}>{tc("review")}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* COMPLETED */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
              {t("completed")}
            </CardTitle>
            <CardDescription>{t("completedHint", { auto: autoExecuted, recs: acceptedRecs })}</CardDescription>
          </CardHeader>
          <CardContent>
            {completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneCompleted")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {Object.entries(completedByAgent).map(([agent, titles]) => (
                  <li key={agent}>
                    <p className="text-sm font-medium">{agentName(agent)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {titles.slice(0, 5).map((title, i) => (
                        <li key={i} className="truncate text-sm text-muted-foreground">· {title}</li>
                      ))}
                      {titles.length > 5 && (
                        <li className="text-xs text-muted-foreground">{t("more", { n: titles.length - 5 })}</li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ATTEMPTED */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              {t("attempted")}
            </CardTitle>
            <CardDescription>{t("attemptedHint", { actions: audit.length, delegations })}</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneAttempted")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {["auto_executed", "notified", "pending_approval", "denied"].map((d) => {
                  const n = audit.filter((a) => a.decision === d).length;
                  return n > 0 ? (
                    <Badge key={d} variant={DECISION_VARIANT[d] ?? "outline"}>
                      {ta(`decisions.${d}`)}: {n}
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BLOCKED */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="size-4 text-destructive" aria-hidden="true" />
              {t("blocked")}
            </CardTitle>
            <CardDescription>{t("blockedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {blocked.length === 0 && blockedWork.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneBlocked")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blocked.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={DECISION_VARIANT[a.decision] ?? "destructive"} className="text-[10px]">
                      {ta(`decisions.${a.decision}`)}
                    </Badge>
                    <span className="font-medium">{agentName(a.agent)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.detail ?? a.action}</span>
                  </li>
                ))}
                {blockedWork.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="destructive" className="text-[10px]">{t("blockedWork")}</Badge>
                    <span className="font-medium">{agentName(w.agent)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{w.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* WAITING — founder attention queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" aria-hidden="true" />
              {t("waiting")}
            </CardTitle>
            <CardDescription>{t("waitingHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <BriefStat label={t("labelPendingApprovals")} n={pendingApprovals.length} />
            <BriefStat label={t("labelProposedWork")} n={proposedWork.length} />
            <BriefStat label={t("labelOpenRecs")} n={openRecs.length} />
            <BriefStat label={t("labelProposedObjectives")} n={proposedObjectives.length} />
          </CardContent>
        </Card>

        {/* WHY */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("why")}</CardTitle>
            <CardDescription>{t("whyHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {why.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneWhy")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {why.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                    <Badge variant={DECISION_VARIANT[a.decision] ?? "outline"} className="text-[10px]">
                      {ta(`decisions.${a.decision}`)}
                    </Badge>
                    <span className="font-medium">{agentName(a.agent)}</span>
                    {a.category ? <span className="text-xs text-muted-foreground">{ta(`categories.${a.category}`)}</span> : null}
                    {a.risk_level ? <Badge variant="outline" className="text-[10px]">{ta(`riskLevel.${a.risk_level}`)}</Badge> : null}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.detail ?? a.action}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.created_at, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BriefStat({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <Badge variant={n > 0 ? "default" : "outline"}>{n}</Badge>
    </div>
  );
}
