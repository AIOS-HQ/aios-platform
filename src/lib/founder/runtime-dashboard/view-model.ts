import type { ProbeCategorySummary, RuntimeProbeSummary } from "@/lib/runtime/probes/types";

export interface FounderRuntimeDashboardMetadata {
  generatedAt: string | null;
  expiresAt: string | null;
  stale: boolean;
  present: boolean;
}

export interface FounderRuntimeDashboardViewModel {
  status: RuntimeProbeSummary["status"] | "unknown";
  generatedAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
  expiresAt: string | null;
  counts: {
    total: number;
    healthy: number;
    degraded: number;
    failed: number;
    unknown: number;
    stale: number;
  };
  categories: ProbeCategorySummary[];
  available: boolean;
  fallback: boolean;
}

function emptyCounts(): FounderRuntimeDashboardViewModel["counts"] {
  return {
    total: 0,
    healthy: 0,
    degraded: 0,
    failed: 0,
    unknown: 0,
    stale: 0,
  };
}

export function createFounderRuntimeDashboardUnavailableViewModel(): FounderRuntimeDashboardViewModel {
  return {
    status: "unknown",
    generatedAt: null,
    freshness: "unknown",
    expiresAt: null,
    counts: emptyCounts(),
    categories: [],
    available: false,
    fallback: true,
  };
}

export function mapFounderRuntimeDashboardViewModel(
  summary: RuntimeProbeSummary | null,
  metadata: FounderRuntimeDashboardMetadata | null,
): FounderRuntimeDashboardViewModel {
  if (!summary) {
    return createFounderRuntimeDashboardUnavailableViewModel();
  }

  const counts = summary.categories.reduce(
    (acc, category) => ({
      total: acc.total + category.total,
      healthy: acc.healthy + category.healthy,
      degraded: acc.degraded + category.degraded,
      failed: acc.failed + category.failed,
      unknown: acc.unknown + category.unknown,
      stale: acc.stale + category.stale,
    }),
    emptyCounts(),
  );

  const freshness: FounderRuntimeDashboardViewModel["freshness"] = metadata
    ? metadata.stale
      ? "stale"
      : "fresh"
    : "unknown";

  return {
    status: summary.status,
    generatedAt: summary.generatedAt ?? null,
    freshness,
    expiresAt: metadata?.expiresAt ?? null,
    counts,
    categories: summary.categories,
    available: true,
    fallback: false,
  };
}
