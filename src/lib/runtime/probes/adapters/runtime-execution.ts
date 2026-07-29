import { masonRuntimeHealth } from "@/lib/harmony/code/mason-production-runtime";
import { createRuntimeProbeResult, type ProbeScope, type RuntimeProbeResult } from "@/lib/runtime/probes/types";

export async function runtimeExecutionProbe(scope: ProbeScope): Promise<RuntimeProbeResult> {
  const health = await masonRuntimeHealth(scope.userId);
  const observedAt = new Date().toISOString();
  const failing = Object.entries(health)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return createRuntimeProbeResult({
    probeId: `runtime_execution:execution_health:${scope.userId}:${scope.companyId ?? "none"}`,
    source: "runtime_execution",
    category: "execution_health",
    status: failing.length === 0 ? "healthy" : "failed",
    summary:
      failing.length === 0
        ? "Mason runtime execution dependencies are healthy."
        : `Mason runtime blocked dependencies: ${failing.join(", ")}.`,
    observedAt,
    freshness: "fresh",
    scope,
    unavailable: false,
    reason: failing.length === 0 ? undefined : "Required runtime dependencies are not all healthy.",
    recommendedAction:
      failing.length === 0 ? undefined : "Restore blocked runtime dependencies before execution.",
    evidence: [{ source: "runtime_execution", ref: "masonRuntimeHealth", observedAt }],
  });
}
