import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { getAiosAgent } from "@/lib/workforce/registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentRecommendations } from "@/components/harmony/workforce/agent-recommendations";

/**
 * Compact Founder Command Center card: surfaces open agent recommendations with
 * accept/dismiss and a link to the full Review Queue. Renders nothing when there
 * are none, so it stays out of the way until an agent suggests something. Does
 * not duplicate the full Review Queue — just immediate awareness.
 */
export async function CommandCenterRecommendations({
  userId,
  companyId,
}: {
  userId: string;
  companyId: string | null;
}) {
  const t = await getTranslations("workforce");
  const recs = await listRecommendations(userId, { companyId, status: "open", limit: 6 });
  if (recs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-primary" aria-hidden="true" />
            {t("recommendations")}
          </CardTitle>
          <CardDescription>{t("recommendationsHint")}</CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/harmony/review">{t("reviewQueue")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <AgentRecommendations
          showAgent
          recommendations={recs.map((r) => ({
            id: r.id,
            agent: r.agent,
            agentName: getAiosAgent(r.agent)?.name ?? r.agent,
            title: r.title,
            detail: r.detail,
            rationale: r.rationale,
            status: r.status,
          }))}
        />
      </CardContent>
    </Card>
  );
}
