import { loadHarmonyActivity } from "@/lib/harmony/collaboration";
import { createRuntimeProbeResult, type ProbeScope, type RuntimeProbeResult } from "@/lib/runtime/probes/types";

export async function workforceSignalsProbe(scope: ProbeScope): Promise<RuntimeProbeResult> {
  const scoped = await loadHarmonyActivity();

  if (scoped.length === 0) {
    return createRuntimeProbeResult({
      probeId: `workforce_signals:liveness:${scope.userId}:${scope.companyId ?? "none"}`,
      source: "workforce_signals",
      category: "liveness",
      status: "unknown",
      summary: "No workforce live signals are available.",
      observedAt: null,
      freshness: "unknown",
      scope,
      unavailable: true,
      reason: "No message stream events found for workforce scope.",
      evidence: [],
    });
  }

  const observedAt = scoped[0]?.at ?? new Date().toISOString();
  return createRuntimeProbeResult({
    probeId: `workforce_signals:liveness:${scope.userId}:${scope.companyId ?? "none"}`,
    source: "workforce_signals",
    category: "liveness",
    status: "healthy",
    summary: `Workforce live signals detected (${scoped.length} recent message${scoped.length === 1 ? "" : "s"}).`,
    observedAt,
    freshness: "fresh",
    scope,
    unavailable: false,
    evidence: [{ source: "workforce_signals", ref: "harmony:loadHarmonyActivity", observedAt }],
  });
}
