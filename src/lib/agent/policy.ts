import { getConnector } from "@/lib/integrations/connectors";
import type { ConnectorCapability, RiskClass } from "@/lib/integrations/connectors";

/**
 * Harmony autonomy policy (client-safe, pure).
 *
 * Maps a capability or audited tool name onto a risk class that governs whether
 * Harmony may act autonomously or must hold for founder approval:
 *  - routine     → may execute autonomously (still owner-scoped + audited)
 *  - approval    → requires founder approval before executing
 *  - destructive → requires founder approval AND is flagged high-risk / irreversible
 *
 * This is the single source of truth the connector runtime and the Approval
 * Center both consult, so governance is consistent everywhere.
 */

export type { RiskClass };

/** Effective risk for a capability: explicit `risk`, else derived from mode. */
export function effectiveRisk(
  capability: Pick<ConnectorCapability, "mode" | "risk">,
): RiskClass {
  if (capability.risk) return capability.risk;
  return capability.mode === "read" ? "routine" : "approval";
}

/** Whether an action of this risk may run without founder approval. */
export function isAutonomous(risk: RiskClass): boolean {
  return risk === "routine";
}

/**
 * Classify an audited tool name. Connector tools look like
 * "connector:{connectorId}.{capabilityId}". Anything else (memory tools, etc.)
 * is treated as routine. Unknown connector capabilities default to approval.
 */
export function classifyTool(tool: string): RiskClass {
  if (tool.startsWith("connector:")) {
    const rest = tool.slice("connector:".length);
    const dot = rest.indexOf(".");
    if (dot > 0) {
      const connectorId = rest.slice(0, dot);
      const capabilityId = rest.slice(dot + 1);
      const connector = getConnector(connectorId);
      const cap = connector?.capabilities.find((c) => c.id === capabilityId);
      if (cap) return effectiveRisk(cap);
    }
    return "approval";
  }
  return "routine";
}
