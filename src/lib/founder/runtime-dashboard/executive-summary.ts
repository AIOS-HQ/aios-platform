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

export type RuntimeRecommendationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type RuntimeRecommendationExpectedImpact = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RuntimeRecommendationEstimatedFounderEffort = "NONE" | "<5_MIN" | "5_TO_15_MIN" | "15_PLUS_MIN";

export interface RuntimeFounderRecommendation {
  id: string;
  title: string;
  priority: RuntimeRecommendationPriority;
  rationale: string;
  expectedImpact: RuntimeRecommendationExpectedImpact;
  estimatedFounderEffort: RuntimeRecommendationEstimatedFounderEffort;
  confidence: number;
  evidence: string[];
  actionRequired: boolean;
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

const PRIORITY_WEIGHT: Record<RuntimeRecommendationPriority, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

function freshnessWeight(freshness: FounderRuntimeDashboardViewModel["freshness"]): number {
  if (freshness === "fresh") return 3;
  if (freshness === "stale") return 2;
  return 1;
}

function clampConfidence(confidence: number): number {
  if (confidence < 0) return 0;
  if (confidence > 100) return 100;
  return Math.round(confidence);
}

export function composeRuntimeFounderRecommendations(
  viewModel: FounderRuntimeDashboardViewModel,
  executiveSummary: RuntimeExecutiveSummary,
  executiveIntelligence: RuntimeExecutiveIntelligence,
): RuntimeFounderRecommendation[] {
  const recommendations: RuntimeFounderRecommendation[] = [];
  const summaryEvidence = [executiveSummary.headline, ...executiveSummary.details].filter((item) => item.length > 0);
  const intelligenceEvidence = executiveIntelligence.sections.flatMap((section) =>
    section.insights.map((insight) => `${section.title}: ${insight}`),
  );

  if (viewModel.status === "healthy" && viewModel.available && viewModel.counts.total > 0 && viewModel.freshness === "fresh") {
    return [
      {
        id: "no-action-required",
        title:
          "No action required. Harmony has not identified any operational conditions requiring Founder intervention.",
        priority: "INFO",
        rationale: "All observed runtime probes are healthy with fresh evidence.",
        expectedImpact: "NONE",
        estimatedFounderEffort: "NONE",
        confidence: 96,
        evidence: [
          `overall status: ${viewModel.status}`,
          `probe counts: healthy=${viewModel.counts.healthy}, degraded=${viewModel.counts.degraded}, failed=${viewModel.counts.failed}, unknown=${viewModel.counts.unknown}`,
          `freshness: ${viewModel.freshness}`,
          ...summaryEvidence,
        ],
        actionRequired: false,
      },
    ];
  }

  if (!viewModel.available) {
    recommendations.push({
      id: "restore-runtime-visibility",
      title: "Restore runtime visibility",
      priority: "HIGH",
      rationale: "Runtime telemetry is unavailable, limiting operational decision quality.",
      expectedImpact: "HIGH",
      estimatedFounderEffort: "5_TO_15_MIN",
      confidence: 90,
      evidence: [
        `runtime available: ${viewModel.available}`,
        `overall status: ${viewModel.status}`,
        ...summaryEvidence,
        ...intelligenceEvidence.filter((insight) => insight.toLowerCase().includes("insufficient runtime evidence")),
      ],
      actionRequired: true,
    });
  }

  if (viewModel.counts.failed > 0) {
    recommendations.push({
      id: "escalate-failed-runtime-probes",
      title: "Escalate failed runtime probes",
      priority: "CRITICAL",
      rationale: "Failed probes indicate active runtime conditions that can block operations.",
      expectedImpact: "CRITICAL",
      estimatedFounderEffort: "15_PLUS_MIN",
      confidence: clampConfidence(80 + viewModel.counts.failed * 5),
      evidence: [
        `failed probes: ${viewModel.counts.failed}`,
        `overall status: ${viewModel.status}`,
        ...summaryEvidence.filter((item) => item.includes("failed probe") || item.includes("attention")),
      ],
      actionRequired: true,
    });
  }

  if (viewModel.counts.degraded > 0) {
    recommendations.push({
      id: "stabilize-degraded-runtime-probes",
      title: "Stabilize degraded runtime probes",
      priority: viewModel.counts.failed > 0 ? "HIGH" : "MEDIUM",
      rationale: "Degraded probes represent runtime reliability risk before hard failures.",
      expectedImpact: viewModel.counts.failed > 0 ? "HIGH" : "MEDIUM",
      estimatedFounderEffort: "5_TO_15_MIN",
      confidence: clampConfidence(68 + viewModel.counts.degraded * 6),
      evidence: [
        `degraded probes: ${viewModel.counts.degraded}`,
        `failed probes: ${viewModel.counts.failed}`,
        ...summaryEvidence.filter((item) => item.includes("degraded probe") || item.includes("requires follow-up")),
      ],
      actionRequired: true,
    });
  }

  if (viewModel.freshness === "stale" || viewModel.counts.stale > 0) {
    recommendations.push({
      id: "refresh-stale-runtime-evidence",
      title: "Refresh stale runtime health evidence",
      priority: "MEDIUM",
      rationale: "Stale evidence can understate current operational risk posture.",
      expectedImpact: "MEDIUM",
      estimatedFounderEffort: "<5_MIN",
      confidence: 82,
      evidence: [
        `freshness: ${viewModel.freshness}`,
        `stale probes: ${viewModel.counts.stale}`,
        ...summaryEvidence.filter((item) => item.includes("stale")),
      ],
      actionRequired: true,
    });
  }

  if (viewModel.counts.unknown > 0 || viewModel.counts.total === 0) {
    const emptyState = viewModel.counts.total === 0;
    recommendations.push({
      id: emptyState ? "establish-runtime-probe-coverage" : "reduce-unknown-runtime-outcomes",
      title: emptyState ? "Establish runtime probe coverage" : "Reduce unknown runtime probe outcomes",
      priority: emptyState ? "HIGH" : "LOW",
      rationale: emptyState
        ? "No probe evidence is currently available to support executive recommendations."
        : "Unknown probe outcomes reduce confidence in operational decisions.",
      expectedImpact: emptyState ? "HIGH" : "LOW",
      estimatedFounderEffort: emptyState ? "15_PLUS_MIN" : "5_TO_15_MIN",
      confidence: emptyState ? 92 : clampConfidence(60 + viewModel.counts.unknown * 7),
      evidence: [
        `total probes: ${viewModel.counts.total}`,
        `unknown probes: ${viewModel.counts.unknown}`,
        ...intelligenceEvidence.filter(
          (insight) =>
            insight.toLowerCase().includes("insufficient runtime evidence") ||
            insight.toLowerCase().includes("unknown probe"),
        ),
      ],
      actionRequired: true,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "continue-runtime-monitoring",
      title: "Continue active runtime monitoring",
      priority: "INFO",
      rationale: "Current evidence does not indicate a specific founder intervention action.",
      expectedImpact: "NONE",
      estimatedFounderEffort: "NONE",
      confidence: 70,
      evidence: [
        `overall status: ${viewModel.status}`,
        `freshness: ${viewModel.freshness}`,
        ...summaryEvidence,
      ],
      actionRequired: false,
    });
  }

  return recommendations
    .map((recommendation) => ({
      ...recommendation,
      confidence: clampConfidence(recommendation.confidence),
      evidence: recommendation.evidence.filter((item) => item.length > 0),
    }))
    .sort((left, right) => {
      const priorityDelta = PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
      if (priorityDelta !== 0) return priorityDelta;

      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) return confidenceDelta;

      return freshnessWeight(viewModel.freshness) - freshnessWeight(viewModel.freshness);
    })
    .slice(0, 3);
}

export interface RuntimeFounderDecisionCenter {
  operationalState: string;
  founderAttention: string;
  topDecision: string;
  rationale: string;
  expectedImpact: RuntimeRecommendationExpectedImpact;
  actionRequired: boolean;
  supportingRecommendationIds: string[];
}

function mapOperationalState(summary: RuntimeExecutiveSummary): string {
  if (summary.severity === "critical") return "CRITICAL";
  if (summary.severity === "attention") return "ATTENTION";
  if (summary.severity === "healthy") return "HEALTHY";
  return "UNKNOWN";
}

export function composeRuntimeFounderDecisionCenter(
  executiveSummary: RuntimeExecutiveSummary,
  executiveIntelligence: RuntimeExecutiveIntelligence,
  recommendations: RuntimeFounderRecommendation[],
): RuntimeFounderDecisionCenter {
  const actionable = recommendations.filter((recommendation) => recommendation.actionRequired);
  const topRecommendation = actionable[0] ?? null;

  if (!topRecommendation) {
    return {
      operationalState: mapOperationalState(executiveSummary),
      founderAttention: "Runtime is operating within expected parameters.",
      topDecision: "No immediate Founder decision required.",
      rationale: executiveSummary.headline,
      expectedImpact: "NONE",
      actionRequired: false,
      supportingRecommendationIds: recommendations.slice(0, 3).map((recommendation) => recommendation.id),
    };
  }

  const founderAttentionInsight =
    executiveIntelligence.sections.find((section) => section.title === "Founder Attention Queue")?.insights[0] ??
    topRecommendation.rationale;

  return {
    operationalState: mapOperationalState(executiveSummary),
    founderAttention: founderAttentionInsight,
    topDecision: topRecommendation.title,
    rationale: topRecommendation.rationale,
    expectedImpact: topRecommendation.expectedImpact,
    actionRequired: topRecommendation.actionRequired,
    supportingRecommendationIds: [topRecommendation.id],
  };
}
