import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { buildHarmonyExecutiveIntelligence } from "@/lib/harmony/executive-intelligence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Compact Executive Briefing widget for the Command Center. It now reads from
 * the same Harmony Executive Intelligence synthesis as the main cockpit, so the
 * Founder sees one consistent company-state interpretation.
 */
export async function CommandCenterBriefing() {
  const t = await getTranslations("briefing");
  const tc = await getTranslations("commandCenter");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const intel = await buildHarmonyExecutiveIntelligence(user.id, companyId);

  const tiles = [
    { label: t("completedToday"), value: intel.metrics.completedToday, href: "/harmony/briefing" },
    { label: tc("intel.metrics.activeWork"), value: intel.metrics.activeWork, href: "/harmony/workforce" },
    { label: t("blockedToday"), value: intel.metrics.blockedWork, href: "/harmony/operations", danger: intel.metrics.blockedWork > 0 },
    { label: t("waitingShort"), value: intel.metrics.pendingApprovals, href: "/harmony/review", danger: intel.metrics.pendingApprovals > 0 },
    { label: t("activeAgents"), value: intel.metrics.activeAgents, href: "/harmony/workforce" },
    { label: t("newRecs"), value: intel.metrics.openRecommendations, href: "/harmony/review" },
    { label: t("alerts"), value: intel.auditor.risks.length + intel.metrics.connectorIssues, href: "/harmony/operations", danger: intel.auditor.risks.length + intel.metrics.connectorIssues > 0 },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Gauge className="size-4 text-primary" aria-hidden="true" />
          {t("widgetTitle")}
          <Badge
            variant={
              intel.situation === "critical"
                ? "destructive"
                : intel.situation === "attention"
                  ? "default"
                  : "secondary"
            }
            className="ml-1"
          >
            {tc(`intel.state.${intel.situation}`)}
          </Badge>
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/harmony/briefing">
            {t("viewFull")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {tc(`intel.headline.${intel.headline.key}`, { n: intel.headline.primaryCount })}
        </p>
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
