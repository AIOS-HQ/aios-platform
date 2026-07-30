import type { FounderRuntimeDashboardViewModel } from "@/lib/founder/runtime-dashboard/view-model";

export interface RuntimeExecutiveSummary {
  headline: string;
  details: string[];
  severity: "healthy" | "attention" | "critical" | "unknown";
}

export interface RuntimeExecutiveIntelligenceSection {
  title:
    | "Executive Highlights"
    | "Top Risks"
    | "Emerging Trends"
    | "Operational Wins"
    | "Founder Attention Queue";
  insights: string[];
}

export interface RuntimeExecutiveIntelligence {
  sections: RuntimeExecutiveIntelligenceSection[];
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

function hasProbeEvidence(viewModel: FounderRuntimeDashboardViewModel): boolean {
  return viewModel.available && viewModel.counts.total > 0;
}

function insufficientEvidence(message: string): string[] {
  return [message];
}

export function composeRuntimeExecutiveIntelligence(
  viewModel: FounderRuntimeDashboardViewModel,
): RuntimeExecutiveIntelligence {
  const summary = composeRuntimeExecutiveSummary(viewModel);
  const evidenceAvailable = hasProbeEvidence(viewModel);

  const executiveHighlights: string[] = evidenceAvailable
    ? [summary.headline, ...summary.details]
    : insufficientEvidence("Insufficient runtime evidence to derive executive highlights.");

  const topRisks: string[] = [];
  if (viewModel.counts.failed > 0) {
    topRisks.push(`${viewModel.counts.failed} failed probe${viewModel.counts.failed === 1 ? "" : "s"} require immediate escalation.`);
  }
  if (viewModel.counts.degraded > 0) {
    topRisks.push(`${viewModel.counts.degraded} degraded probe${viewModel.counts.degraded === 1 ? "" : "s"} may impact runtime reliability.`);
  }
  if (viewModel.freshness === "stale" || viewModel.counts.stale > 0) {
    topRisks.push("Health snapshot is stale; current risk posture may be understated.");
  }
  if (viewModel.counts.unknown > 0) {
    topRisks.push(`${viewModel.counts.unknown} unknown probe${viewModel.counts.unknown === 1 ? "" : "s"} limit confidence in runtime coverage.`);
  }
  if (topRisks.length === 0) {
    topRisks.push(
      evidenceAvailable
        ? "No material runtime risks detected from current probe evidence."
        : "Insufficient runtime evidence to derive top risks.",
    );
  }

  const emergingTrends: string[] = [];
  if (evidenceAvailable) {
    if (viewModel.counts.healthy === viewModel.counts.total && viewModel.freshness === "fresh") {
      emergingTrends.push("Runtime signals remain consistently healthy in the current snapshot.");
    }
    if (viewModel.counts.degraded > 0 && viewModel.counts.failed === 0) {
      emergingTrends.push("Degradation is present without hard failures, indicating early-stage risk.");
    }
    if (viewModel.counts.failed > 0) {
      emergingTrends.push("Failure conditions are now present in the active runtime snapshot.");
    }
    if (viewModel.counts.unknown > 0) {
      emergingTrends.push("Unknown probe outcomes indicate incomplete runtime observability.");
    }
    if (viewModel.freshness === "unknown") {
      emergingTrends.push("Snapshot freshness is unknown, so trend confidence is reduced.");
    }
  }
  if (emergingTrends.length === 0) {
    emergingTrends.push(
      evidenceAvailable
        ? "No directional trend is detectable from current runtime evidence."
        : "Insufficient runtime evidence to derive emerging trends.",
    );
  }

  const operationalWins: string[] = [];
  if (viewModel.counts.healthy > 0) {
    operationalWins.push(`${viewModel.counts.healthy} probe${viewModel.counts.healthy === 1 ? " is" : "s are"} reporting healthy status.`);
  }
  if (viewModel.available && viewModel.freshness === "fresh") {
    operationalWins.push("Health data is current and available for executive review.");
  }
  if (operationalWins.length === 0) {
    operationalWins.push(
      evidenceAvailable
        ? "No clear operational wins are supported by current runtime evidence."
        : "Insufficient runtime evidence to derive operational wins.",
    );
  }

  const founderAttentionQueue: string[] = [];
  if (!viewModel.available) {
    founderAttentionQueue.push("Restore runtime health visibility before making operational decisions.");
  }
  if (viewModel.counts.failed > 0) {
    founderAttentionQueue.push("Resolve failed runtime probes first to reduce immediate operational risk.");
  }
  if (viewModel.counts.degraded > 0) {
    founderAttentionQueue.push("Investigate degraded probes and recover them to healthy status.");
  }
  if (viewModel.freshness === "stale") {
    founderAttentionQueue.push("Refresh stale runtime snapshot to confirm current system posture.");
  }
  if (viewModel.counts.unknown > 0) {
    founderAttentionQueue.push("Increase probe coverage for unknown runtime areas.");
  }
  if (founderAttentionQueue.length === 0) {
    founderAttentionQueue.push(
      evidenceAvailable
        ? "Maintain current runtime operating posture and continue monitoring for regressions."
        : "Insufficient runtime evidence to build a prioritized founder attention queue.",
    );
  }

  return {
    sections: [
      { title: "Executive Highlights", insights: executiveHighlights },
      { title: "Top Risks", insights: topRisks },
      { title: "Emerging Trends", insights: emergingTrends },
      { title: "Operational Wins", insights: operationalWins },
      { title: "Founder Attention Queue", insights: founderAttentionQueue },
    ],
  };
}
