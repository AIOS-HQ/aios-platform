import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import {
  getAutonomyState,
  evaluate,
  deriveRiskLevel,
  type ActionCategory,
} from "@/lib/workforce/autonomy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentRecommendations } from "@/components/harmony/workforce/agent-recommendations";
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import { ExecutiveList, SignalPill } from "@/components/shared/executive";

const AGENT = "catalyst";

const DECISION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  auto_executed: "default",
  notified: "secondary",
  pending_approval: "outline",
  denied: "destructive",
  kill_switch: "destructive",
  lockdown: "destructive",
};
const RISKLEVEL_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};
const ACTIVE = ["proposed", "approved", "in_progress"];

/**
 * Catalyst's Content & Growth operations panel. Ties the Content area into the
 * AIOS workforce: Catalyst's work items (with the live autonomy decision),
 * recommendations, and links to the Work Queue / Review / Autonomy / Library.
 * Communications content can progress autonomously per policy; publishing stays
 * founder-approved (shown via the decision badge). Reuses existing systems —
 * no parallel content framework.
 */
export async function CatalystWorkspace() {
  const t = await getTranslations("content");
  const ta = await getTranslations("autonomy");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const def = getAiosAgent(AGENT);

  const [work, recs, autonomy] = await Promise.all([
    listWorkItems(user.id, { companyId, agent: AGENT, limit: 50 }),
    listRecommendations(user.id, { companyId, agent: AGENT, status: "open", limit: 20 }),
    getAutonomyState(user.id),
  ]);
  const agentMode = autonomy.agents[AGENT]?.mode ?? autonomy.global.mode ?? "off";
  const active = work.filter((w) => ACTIVE.includes(w.status));

  return (
    <Card className="mb-6 overflow-hidden border-primary/30">
      <CardHeader className="border-b bg-primary/5">
        <div className="flex flex-wrap items-start gap-3">
          <AgentGlyph
            agent={AGENT}
            size="lg"
            className="border-primary/30 bg-primary/10 text-primary"
          />
          <div className="min-w-0">
            <CardTitle className="text-lg tracking-tight">{t("opsTitle")}</CardTitle>
            <CardDescription className="mt-1">
              {t("ownedBy", { name: def?.name ?? "Catalyst" })}
            </CardDescription>
          </div>
          <div className="ml-auto">
            <SignalPill tone={agentMode === "bounded" ? "success" : agentMode === "advisory" ? "info" : "neutral"}>
              {ta(`modes.${agentMode}`)}
            </SignalPill>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xl font-semibold tabular-nums">{active.length}</p>
            <p className="text-xs text-muted-foreground">{t("workItems")}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xl font-semibold tabular-nums">{recs.length}</p>
            <p className="text-xs text-muted-foreground">{t("recommendations")}</p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xl font-semibold tabular-nums">{work.length}</p>
            <p className="text-xs text-muted-foreground">
              {t("ownedBy", { name: def?.name ?? "Catalyst" })}
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("workItems")}</h3>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noWork")}</p>
          ) : (
            <ExecutiveList>
              {active.map((w) => {
                const riskLevel = deriveRiskLevel(w.risk, w.risk_level);
                const category = (w.category ?? null) as ActionCategory | null;
                const ev = category
                  ? evaluate({
                      category,
                      riskLevel,
                      global: autonomy.global,
                      agent: autonomy.agents[AGENT] ?? null,
                      categoryPolicy: autonomy.categories[category] ?? null,
                    })
                  : { decision: "pending_approval" as const, reason: "No action category set." };
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 p-4">
                    <span className="text-sm font-semibold">{w.title}</span>
                    {w.category ? (
                      <Badge variant="secondary" className="text-[10px]">{ta(`categories.${w.category}`)}</Badge>
                    ) : null}
                    <Badge variant={RISKLEVEL_VARIANT[riskLevel] ?? "outline"} className="text-[10px]">
                      {ta(`riskLevel.${riskLevel}`)}
                    </Badge>
                    <Badge variant={DECISION_VARIANT[ev.decision] ?? "outline"} className="ml-auto text-[10px]" title={ev.reason}>
                      {ta(`decisions.${ev.decision}`)}
                    </Badge>
                  </li>
                );
              })}
            </ExecutiveList>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recommendations")}</h3>
          <AgentRecommendations
            recommendations={recs.map((r) => ({
              id: r.id,
              agent: r.agent,
              agentName: def?.name ?? "Catalyst",
              title: r.title,
              detail: r.detail,
              rationale: r.rationale,
              status: r.status,
            }))}
          />
        </section>

        <p className="text-xs text-muted-foreground">{t("publishingNote")}</p>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/harmony/work?agent=catalyst">{t("openWorkQueue")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/harmony/review">{t("openReview")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/harmony/autonomy">{t("openAutonomy")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/library">{t("openLibrary")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/harmony/workforce/${AGENT}`}>{t("openCatalyst")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
