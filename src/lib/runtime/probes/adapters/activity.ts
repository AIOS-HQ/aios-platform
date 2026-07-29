import { listActivity } from "@/lib/data/os/activity";
import { createRuntimeProbeResult, type ProbeScope, type RuntimeProbeResult } from "@/lib/runtime/probes/types";

export async function activityProbe(scope: ProbeScope): Promise<RuntimeProbeResult> {
  const items = await listActivity({ companyId: scope.companyId ?? undefined, limit: 50 });
  if (items.length === 0) {
    return createRuntimeProbeResult({
      probeId: `agent_activity:operational_activity:${scope.userId}:${scope.companyId ?? "none"}`,
      source: "agent_activity",
      category: "operational_activity",
      status: "unknown",
      summary: "No operational activity data is available.",
      observedAt: null,
      freshness: "unknown",
      scope,
      unavailable: true,
      reason: "Activity feed returned no records for the current scope.",
      evidence: [],
    });
  }

  const observedAt = items[0]?.created_at ?? new Date().toISOString();
  return createRuntimeProbeResult({
    probeId: `agent_activity:operational_activity:${scope.userId}:${scope.companyId ?? "none"}`,
    source: "agent_activity",
    category: "operational_activity",
    status: "healthy",
    summary: `Operational activity observed (${items.length} recent event${items.length === 1 ? "" : "s"}).`,
    observedAt,
    freshness: "fresh",
    scope,
    unavailable: false,
    evidence: [{ source: "agent_activity", ref: "activity_events:listActivity", observedAt }],
  });
}
