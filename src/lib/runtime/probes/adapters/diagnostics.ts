import { runProductionReadiness } from "@/lib/integrations/clients/production-readiness";
import { createRuntimeProbeResult, type ProbeScope, type RuntimeProbeResult } from "@/lib/runtime/probes/types";

export async function diagnosticsProbe(scope: ProbeScope): Promise<RuntimeProbeResult> {
  const readiness = await runProductionReadiness(scope.userId, null);
  const observedAt = new Date().toISOString();

  return createRuntimeProbeResult({
    probeId: `diagnostics:readiness:${scope.userId}:${scope.companyId ?? "none"}`,
    source: "diagnostics",
    category: "readiness",
    status: readiness.status === "ok" ? "healthy" : "degraded",
    summary:
      readiness.status === "ok"
        ? "Production readiness checks are passing."
        : "Production readiness reports warnings.",
    observedAt,
    freshness: "fresh",
    scope,
    unavailable: false,
    reason: readiness.status === "ok" ? undefined : "At least one readiness section has a blocking or warning condition.",
    recommendedAction: readiness.status === "ok" ? undefined : "Review diagnostics sections with warning status.",
    evidence: readiness.sections.map((s) => ({ source: "diagnostics" as const, ref: `readiness:${s.id}:${s.status}`, observedAt })),
  });
}
