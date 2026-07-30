import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FounderRuntimeDashboardViewModel } from "@/lib/founder/runtime-dashboard/view-model";
import { composeRuntimeExecutiveIntelligence, composeRuntimeExecutiveSummary } from "@/lib/founder/runtime-dashboard/executive-summary";

interface RuntimeDashboardSummaryProps {
  viewModel: FounderRuntimeDashboardViewModel;
}

export function RuntimeDashboardSummary({ viewModel }: RuntimeDashboardSummaryProps) {
  const executiveSummary = composeRuntimeExecutiveSummary(viewModel);
  const executiveIntelligence = composeRuntimeExecutiveIntelligence(viewModel);

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
