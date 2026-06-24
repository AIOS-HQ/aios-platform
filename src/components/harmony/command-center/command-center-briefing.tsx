import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Gauge, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { AIOS_WORKFORCE } from "@/lib/workforce/registry";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { listObjectives } from "@/lib/workforce/objectives";
import { getAutonomyState, listAutonomyAudit } from "@/lib/workforce/autonomy";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const AUTO = ["auto_executed", "notified"];
const BLOCKED = ["denied", "kill_switch", "lockdown"];
const ACTIVE_WORK = ["proposed", "approved", "in_progress"];

/**
 * Compact Executive Briefing widget for the Command Center. Summarizes (does not
 * duplicate) the Founder Briefing — today's completed/attempted/blocked, the
 * attention queue, active agents, autonomy status, new recommendations, and
 * critical alerts. Each tile drills into the relevant page. Reuses existing
 * data only; no new storage.
 */
export async function CommandCenterBriefing() {
  const t = await getTranslations("briefing");
  const ta = await getTranslations("autonomy");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [audit, work, recs, objectives, messages, autonomy] = await Promise.all([
    listAutonomyAudit(user.id, 300),
    listWorkItems(user.id, { companyId, limit: 300 }),
    listRecommendations(user.id, { companyId, status: "open", limit: 200 }),
    listObjectives(user.id, { companyId, status: "proposed", limit: 200 }),
    companyId ? listAgentMessages(user.id, companyId, { limit: 200 }) : Promise.resolve([]),
    getAutonomyState(user.id),
  ]);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const isToday = (ts: string) => new Date(ts).getTime() >= todayStart.getTime();
  const auditToday = audit.filter((a) => isToday(a.created_at));

  const completedToday = auditToday.filter((a) => AUTO.includes(a.decision)).length;
  const attemptedToday = auditToday.length;
  const blockedToday = auditToday.filter((a) => BLOCKED.includes(a.decision)).length;

  const pendingApprovals = messages.filter((m) => m.status === "awaiting_approval").length;
  const proposedWork = work.filter((w) => w.status === "proposed").length;
  const waiting = pendingApprovals + proposedWork + recs.length + objectives.length;

  const activeAgentKeys = new Set<string>();
  for (const w of work) if (ACTIVE_WORK.includes(w.status)) activeAgentKeys.add(w.agent);
  for (const a of AIOS_WORKFORCE) {
    if ((autonomy.agents[a.key]?.mode ?? autonomy.global.mode) !== "off") activeAgentKeys.add(a.key);
  }
  const activeAgents = activeAgentKeys.size;

  const blockedWork = work.filter((w) => w.status === "blocked").length;
  const criticalAlerts =
    (autonomy.global.kill_switch ? 1 : 0) + (autonomy.global.lockdown ? 1 : 0) + blockedWork + blockedToday;

  const autonomyLabel = autonomy.global.kill_switch
    ? ta("killSwitch")
    : autonomy.global.lockdown
      ? ta("lockdown")
      : ta(`modes.${autonomy.global.mode}`);
  const autonomyDanger = autonomy.global.kill_switch || autonomy.global.lockdown;

  const tiles: { label: string; value: number; href: string; danger?: boolean }[] = [
    { label: t("completedToday"), value: completedToday, href: "/harmony/briefing" },
    { label: t("attemptedToday"), value: attemptedToday, href: "/harmony/autonomy" },
    { label: t("blockedToday"), value: blockedToday, href: "/harmony/operations", danger: blockedToday > 0 },
    { label: t("waitingShort"), value: waiting, href: "/harmony/review" },
    { label: t("activeAgents"), value: activeAgents, href: "/harmony/workforce" },
    { label: t("newRecs"), value: recs.length, href: "/harmony/review" },
    { label: t("alerts"), value: criticalAlerts, href: "/harmony/operations", danger: criticalAlerts > 0 },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" aria-hidden="true" />
          {t("widgetTitle")}
          <Badge
            variant={autonomyDanger ? "destructive" : autonomy.global.mode === "bounded" ? "default" : "secondary"}
            className="ml-1"
          >
            {t("autonomyStatus")}: {autonomyLabel}
          </Badge>
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/harmony/briefing">
            {t("viewFull")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {tiles.map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <p className={`text-xl font-bold tabular-nums ${tile.danger ? "text-destructive" : ""}`}>{tile.value}</p>
              <p className="text-xs text-muted-foreground">{tile.label}</p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
