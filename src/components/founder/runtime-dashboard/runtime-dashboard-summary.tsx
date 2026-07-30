import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FounderRuntimeDashboardViewModel } from "@/lib/founder/runtime-dashboard/view-model";
import {
  composeRuntimeFounderDecisionCenter,
  composeRuntimeExecutiveIntelligence,
  composeRuntimeExecutiveSummary,
  composeRuntimeFounderRecommendations,
} from "@/lib/founder/runtime-dashboard/executive-summary";

interface RuntimeDashboardSummaryProps {
  viewModel: FounderRuntimeDashboardViewModel;
}

export function RuntimeDashboardSummary({ viewModel }: RuntimeDashboardSummaryProps) {
  const executiveSummary = composeRuntimeExecutiveSummary(viewModel);
  const executiveIntelligence = composeRuntimeExecutiveIntelligence(viewModel);
  const recommendations = composeRuntimeFounderRecommendations(viewModel, executiveSummary, executiveIntelligence);
  const decisionCenter = composeRuntimeFounderDecisionCenter(executiveSummary, executiveIntelligence, recommendations);

  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <CardTitle className="text-base">Operational Runtime Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Executive Summary</p>
          <p className="mt-1 text-sm font-medium">{executiveSummary.headline}</p>
          <p className="mt-1 text-xs text-muted-foreground">{executiveSummary.details.join(" • ")}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Executive Runtime Intelligence</p>
          <div className="mt-2 space-y-3">
            {executiveIntelligence.sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-medium text-foreground">{section.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{section.insights.join(" • ")}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Founder Recommendations</p>
          <div className="mt-2 space-y-3">
            {recommendations.map((recommendation) => (
              <div key={`${recommendation.title}-${recommendation.priority}-${recommendation.confidence}`}>
                <p className="text-xs font-medium text-foreground">{recommendation.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{recommendation.rationale}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Priority: {recommendation.priority} • Impact: {recommendation.expectedImpact} • Effort: {recommendation.estimatedFounderEffort} • Confidence: {recommendation.confidence}% • Action required: {recommendation.actionRequired ? "Yes" : "No"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Evidence: {recommendation.evidence.join(" • ")}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Founder Decision Center</p>
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground">Operational state</p>
            <p className="text-xs font-medium text-foreground">{decisionCenter.operationalState}</p>
            <p className="text-xs text-muted-foreground">Founder attention</p>
            <p className="text-xs font-medium text-foreground">{decisionCenter.founderAttention}</p>
            <p className="text-xs text-muted-foreground">Top decision</p>
            <p className="text-xs font-medium text-foreground">{decisionCenter.topDecision}</p>
            <p className="text-xs text-muted-foreground">Rationale</p>
            <p className="text-xs font-medium text-foreground">{decisionCenter.rationale}</p>
            <p className="text-[11px] text-muted-foreground">
              Impact: {decisionCenter.expectedImpact} • Action required: {decisionCenter.actionRequired ? "Yes" : "No"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Supporting recommendation ids: {decisionCenter.supportingRecommendationIds.join(" • ") || "—"}
            </p>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><span className="text-muted-foreground">Overall status</span><p className="font-medium">{viewModel.status}</p></div>
        <div><span className="text-muted-foreground">Generated</span><p className="font-medium">{viewModel.generatedAt ?? "—"}</p></div>
        <div><span className="text-muted-foreground">Freshness</span><p className="font-medium">{viewModel.freshness}</p></div>
        <div><span className="text-muted-foreground">Expires</span><p className="font-medium">{viewModel.expiresAt ?? "—"}</p></div>
        <div><span className="text-muted-foreground">Total probes</span><p className="font-medium">{viewModel.counts.total}</p></div>
        <div><span className="text-muted-foreground">Healthy</span><p className="font-medium">{viewModel.counts.healthy}</p></div>
        <div><span className="text-muted-foreground">Degraded</span><p className="font-medium">{viewModel.counts.degraded}</p></div>
        <div><span className="text-muted-foreground">Failed</span><p className="font-medium">{viewModel.counts.failed}</p></div>
        <div><span className="text-muted-foreground">Unknown</span><p className="font-medium">{viewModel.counts.unknown}</p></div>
        <div><span className="text-muted-foreground">Stale</span><p className="font-medium">{viewModel.counts.stale}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
