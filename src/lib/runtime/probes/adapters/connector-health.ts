import { getConnectorHealth } from "@/lib/integrations/connector-health";
import { createRuntimeProbeResult, type ProbeScope, type RuntimeProbeResult } from "@/lib/runtime/probes/types";

export async function connectorHealthProbe(scope: ProbeScope): Promise<RuntimeProbeResult> {
  const rows = await getConnectorHealth(scope.userId);
  if (rows.length === 0) {
    return createRuntimeProbeResult({
      probeId: `connector_health:connector_health:${scope.userId}:${scope.companyId ?? "none"}`,
      source: "connector_health",
      category: "connector_health",
      status: "unknown",
      summary: "No connector health data is available.",
      observedAt: null,
      freshness: "unknown",
      scope,
      unavailable: true,
      reason: "No connector rows found for this user.",
      evidence: [],
    });
  }

  const observedAt = new Date().toISOString();
  const hasFailed = rows.some((r) => r.state === "needs_reauth" || r.state === "setup_required" || r.state === "unknown");
  const hasDegraded = rows.some((r) => r.state === "plaintext_token" || r.state === "expired_refreshable");
  const status = hasFailed ? "failed" : hasDegraded ? "degraded" : "healthy";

  return createRuntimeProbeResult({
    probeId: `connector_health:connector_health:${scope.userId}:${scope.companyId ?? "none"}`,
    source: "connector_health",
    category: "connector_health",
    status,
    summary:
      status === "healthy"
        ? "All connector health states are healthy."
        : status === "degraded"
          ? "One or more connectors are degraded."
          : "One or more connectors require intervention.",
    observedAt,
    freshness: "fresh",
    scope,
    unavailable: false,
    reason:
      status === "healthy"
        ? undefined
        : status === "degraded"
          ? "Some connectors are refreshable-expired or plaintext-token."
          : "Some connectors are disconnected, unknown, or need re-authentication.",
    recommendedAction: status === "healthy" ? undefined : "Review Integration Center recommended actions.",
    evidence: rows.slice(0, 10).map((r) => ({ source: "connector_health" as const, ref: `connector:${r.provider}:${r.state}`, observedAt })),
  });
}
