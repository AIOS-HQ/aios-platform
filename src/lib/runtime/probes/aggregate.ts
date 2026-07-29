import {
  PROBE_CATEGORIES,
  compareProbeStatusPrecedence,
  createRuntimeProbeResult,
  type ProbeCategory,
  type ProbeCategorySummary,
  type ProbeScope,
  type ProbeStatus,
  type RuntimeProbeResult,
  type RuntimeProbeSummary,
} from "@/lib/runtime/probes/types";
import { authorizeProbeScope, sanitizeProbe, sanitizeProbeReason } from "@/lib/runtime/probes/auth";
import { activityProbe } from "@/lib/runtime/probes/adapters/activity";
import { connectorHealthProbe } from "@/lib/runtime/probes/adapters/connector-health";
import { diagnosticsProbe } from "@/lib/runtime/probes/adapters/diagnostics";
import { runtimeExecutionProbe } from "@/lib/runtime/probes/adapters/runtime-execution";
import { workforceSignalsProbe } from "@/lib/runtime/probes/adapters/workforce";

export interface RuntimeProbeAdapters {
  runtimeExecutionProbe: (scope: ProbeScope) => Promise<RuntimeProbeResult>;
  connectorHealthProbe: (scope: ProbeScope) => Promise<RuntimeProbeResult>;
  diagnosticsProbe: (scope: ProbeScope) => Promise<RuntimeProbeResult>;
  activityProbe: (scope: ProbeScope) => Promise<RuntimeProbeResult>;
  workforceSignalsProbe: (scope: ProbeScope) => Promise<RuntimeProbeResult>;
}

const DEFAULT_ADAPTERS: RuntimeProbeAdapters = {
  runtimeExecutionProbe,
  connectorHealthProbe,
  diagnosticsProbe,
  activityProbe,
  workforceSignalsProbe,
};

const ADAPTER_ORDER: readonly {
  source: RuntimeProbeResult["source"];
  category: ProbeCategory;
  run: (adapters: RuntimeProbeAdapters, scope: ProbeScope) => Promise<RuntimeProbeResult>;
}[] = [
  { source: "runtime_execution", category: "execution_health", run: (a, s) => a.runtimeExecutionProbe(s) },
  { source: "connector_health", category: "connector_health", run: (a, s) => a.connectorHealthProbe(s) },
  { source: "diagnostics", category: "readiness", run: (a, s) => a.diagnosticsProbe(s) },
  { source: "agent_activity", category: "operational_activity", run: (a, s) => a.activityProbe(s) },
  { source: "workforce_signals", category: "liveness", run: (a, s) => a.workforceSignalsProbe(s) },
] as const;

const CATEGORY_ORDER = new Map<ProbeCategory, number>(PROBE_CATEGORIES.map((c, i) => [c, i]));

function statusFromCounts(counts: Pick<ProbeCategorySummary, "failed" | "degraded" | "healthy" | "unknown">): ProbeStatus {
  if (counts.failed > 0) return "failed";
  if (counts.degraded > 0) return "degraded";
  if (counts.healthy > 0) return "healthy";
  return "unknown";
}

function deterministicSort(a: RuntimeProbeResult, b: RuntimeProbeResult): number {
  const byCategory = (CATEGORY_ORDER.get(a.category) ?? 999) - (CATEGORY_ORDER.get(b.category) ?? 999);
  if (byCategory !== 0) return byCategory;
  const bySource = a.source.localeCompare(b.source);
  if (bySource !== 0) return bySource;
  return a.probeId.localeCompare(b.probeId);
}

export async function listRuntimeProbes(
  scope: ProbeScope,
  adapters: RuntimeProbeAdapters = DEFAULT_ADAPTERS,
): Promise<RuntimeProbeResult[]> {
  const authorizedScope = await authorizeProbeScope(scope);
  const probes: RuntimeProbeResult[] = [];

  for (const item of ADAPTER_ORDER) {
    try {
      const probe = await item.run(adapters, authorizedScope);
      probes.push(sanitizeProbe({ ...probe, scope: authorizedScope }));
    } catch (error) {
      probes.push(
        sanitizeProbe(
          createRuntimeProbeResult({
          probeId: `${item.source}:${item.category}:${authorizedScope.userId}:${authorizedScope.companyId ?? "none"}:adapter_error`,
          source: item.source,
          category: item.category,
          status: "unknown",
          summary: `${item.source} adapter failed to produce a probe result.`,
          observedAt: null,
          freshness: "unknown",
          scope: authorizedScope,
          unavailable: true,
          reason: sanitizeProbeReason(error instanceof Error ? error.message : "Adapter threw a non-Error value"),
          evidence: [],
        }),
        ),
      );
    }
  }

  return probes.sort(deterministicSort);
}

export function summarizeRuntimeProbes(
  probes: RuntimeProbeResult[],
  scope: ProbeScope,
  generatedAt = new Date().toISOString(),
): RuntimeProbeSummary {
  const categories: ProbeCategorySummary[] = PROBE_CATEGORIES.map((category) => {
    const rows = probes.filter((p) => p.category === category);
    const healthy = rows.filter((p) => p.status === "healthy").length;
    const degraded = rows.filter((p) => p.status === "degraded").length;
    const failed = rows.filter((p) => p.status === "failed").length;
    const unknown = rows.filter((p) => p.status === "unknown").length;
    const stale = rows.filter((p) => p.freshness === "stale").length;

    return {
      category,
      total: rows.length,
      healthy,
      degraded,
      failed,
      unknown,
      stale,
      status: statusFromCounts({ failed, degraded, healthy, unknown }),
    };
  });

  const overall = categories.reduce<ProbeStatus>((current, c) => {
    return compareProbeStatusPrecedence(c.status, current) > 0 ? c.status : current;
  }, "unknown");

  return {
    status: overall,
    generatedAt: new Date(generatedAt).toISOString(),
    scope,
    probes: [...probes].sort(deterministicSort),
    categories,
  };
}

export async function getRuntimeProbeSummary(
  scope: ProbeScope,
  adapters: RuntimeProbeAdapters = DEFAULT_ADAPTERS,
): Promise<RuntimeProbeSummary> {
  const probes = await listRuntimeProbes(scope, adapters);
  return summarizeRuntimeProbes(probes, probes[0]?.scope ?? scope);
}
