import type { FounderRuntimeDashboardViewModel } from "@/lib/founder/runtime-dashboard/view-model";

export interface RuntimeExecutiveSummary {
  headline: string;
  details: string[];
  severity: "healthy" | "attention" | "critical" | "unknown";
}

function summarizeTopSignals(viewModel: FounderRuntimeDashboardViewModel): string[] {
  const details: string[] = [];

  if (viewModel.counts.failed > 0) {
    details.push(`${viewModel.counts.failed} failed probe${viewModel.counts.failed === 1 ? "" : "s"}`);
  }

  if (viewModel.counts.degraded > 0) {
    details.push(`${viewModel.counts.degraded} degraded probe${viewModel.counts.degraded === 1 ? "" : "s"}`);
  }

  if (viewModel.counts.stale > 0 || viewModel.freshness === "stale") {
    details.push("snapshot is stale");
  }

  if (viewModel.counts.unknown > 0) {
    details.push(`${viewModel.counts.unknown} unknown probe${viewModel.counts.unknown === 1 ? "" : "s"}`);
  }

  if (details.length === 0 && viewModel.available) {
    details.push(`${viewModel.counts.healthy} healthy probe${viewModel.counts.healthy === 1 ? "" : "s"}`);
  }

  return details;
}

export function composeRuntimeExecutiveSummary(
  viewModel: FounderRuntimeDashboardViewModel,
): RuntimeExecutiveSummary {
  if (!viewModel.available || viewModel.status === "unknown") {
    return {
      headline: "Runtime status is currently unavailable",
      details: ["health summary could not be retrieved"],
      severity: "unknown",
    };
  }

  if (viewModel.status === "failed" || viewModel.counts.failed > 0) {
    return {
      headline: "Executive attention required: runtime failures detected",
      details: summarizeTopSignals(viewModel),
      severity: "critical",
    };
  }

  if (viewModel.status === "degraded" || viewModel.counts.degraded > 0 || viewModel.freshness === "stale") {
    return {
      headline: "Runtime health is degraded and requires follow-up",
      details: summarizeTopSignals(viewModel),
      severity: "attention",
    };
  }

  if (viewModel.status === "healthy") {
    return {
      headline: "Runtime health is stable across operational probes",
      details: summarizeTopSignals(viewModel),
      severity: "healthy",
    };
  }

  return {
    headline: "Runtime status requires review",
    details: summarizeTopSignals(viewModel),
    severity: "unknown",
  };
}
