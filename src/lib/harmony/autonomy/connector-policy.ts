/**
 * Unified Autonomy Policy Engine — Connector runtime bridge (pure).
 *
 * Classifies a connector capability and decides whether it may execute
 * autonomously or must pause for Founder approval, using the engine's own
 * risk-mapping and autonomy-level rules. This replaces the local risk heuristic
 * (`effectiveRisk`) previously used by `connector-runtime.ts`, so connector
 * execution shares one source of truth with every other agent.
 *
 * Pure and dependency-free (engine risk-mapping + autonomy-levels + the connector
 * capability type only): no I/O, client-safe, and unit-testable without a database.
 */

import type { ConnectorCapability } from "@/lib/integrations/connectors";
import type { AutonomyLevel, RiskClass } from "./types";
import { capabilityRisk } from "./risk-mapping";
import {
  canExecuteRoutineAtLevel,
  canExecuteApprovalActionsAtLevel,
} from "./autonomy-levels";

/**
 * Default autonomy level for connector capabilities. "Autonomous" (3) reproduces
 * the connector runtime's historical posture — routine capabilities execute while
 * approval/destructive capabilities pause for Founder approval — now decided by
 * the engine rather than a local heuristic. Callers may override per request.
 */
export const DEFAULT_CONNECTOR_AUTONOMY_LEVEL: AutonomyLevel = 3;

export type ConnectorPolicyDecision = "execute" | "approval_required" | "blocked";

export interface ConnectorRunPolicy {
  risk: RiskClass;
  /** True for irreversible/high-risk capabilities (always approval-gated). */
  destructive: boolean;
  decision: ConnectorPolicyDecision;
  /** True when the capability must be Founder-approved before it runs. */
  requiresApproval: boolean;
  reason: string;
}

/**
 * Resolve the engine risk class for a connector capability. Explicit capability
 * risk wins; otherwise read → routine, write → approval.
 */
export function connectorCapabilityRisk(capability: ConnectorCapability): RiskClass {
  return capabilityRisk(capability.mode, capability.risk);
}

/**
 * Decide whether a connector capability may execute at the given autonomy level,
 * using the engine's routine/approval/destructive rules:
 *  - routine     → executes at autonomy level >= 2 (Supervised and above);
 *  - approval    → executes only at level 4 (Executive); otherwise needs approval;
 *  - destructive → always requires Founder approval, at any level.
 */
export function evaluateConnectorRun(
  capability: ConnectorCapability,
  autonomyLevel: AutonomyLevel = DEFAULT_CONNECTOR_AUTONOMY_LEVEL,
): ConnectorRunPolicy {
  const risk = connectorCapabilityRisk(capability);
  const destructive = risk === "destructive";

  let decision: ConnectorPolicyDecision;
  let reason: string;

  if (risk === "routine") {
    if (canExecuteRoutineAtLevel(autonomyLevel)) {
      decision = "execute";
      reason = `Routine connector capability executes autonomously at autonomy level ${autonomyLevel}.`;
    } else {
      decision = "approval_required";
      reason = `Routine connector capability requires Founder approval at autonomy level ${autonomyLevel}.`;
    }
  } else if (risk === "approval") {
    if (canExecuteApprovalActionsAtLevel(autonomyLevel)) {
      decision = "execute";
      reason = `Approval-class connector capability executes autonomously at executive autonomy level ${autonomyLevel}.`;
    } else {
      decision = "approval_required";
      reason = "Approval-class connector capability requires Founder approval before execution.";
    }
  } else {
    decision = "approval_required";
    reason = "Destructive connector capability always requires Founder approval.";
  }

  return {
    risk,
    destructive,
    decision,
    requiresApproval: decision !== "execute",
    reason,
  };
}
