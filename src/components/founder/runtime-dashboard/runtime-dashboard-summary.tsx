import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FounderRuntimeDashboardViewModel } from "@/lib/founder/runtime-dashboard/view-model";

interface RuntimeDashboardSummaryProps {
  viewModel: FounderRuntimeDashboardViewModel;
}

export function RuntimeDashboardSummary({ viewModel }: RuntimeDashboardSummaryProps) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <CardTitle className="text-base">Operational Runtime Health</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
      </CardContent>
    </Card>
  );
}
