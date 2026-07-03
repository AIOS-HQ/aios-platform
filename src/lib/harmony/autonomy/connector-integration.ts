/**
 * Unified Autonomy Policy Engine — Connector runtime integration.
 *
 * Replaces scattered risk checks in src/lib/integrations/connector-runtime.ts.
 * All connector capabilities now route through the central policy engine.
 *
 * This is a shim that:
 *  1. Evaluates the policy for the requested connector capability
 *  2. Routes to approval if needed
 *  3. Executes or blocks based on the decision
 */

import "server-only";

import type { ConnectorCapability } from "@/lib/integrations/connectors";
import { getActiveDirectives } from "./data-access";
import { evaluateAutonomyPolicy, canExecute, needsApproval, isBlocked } from "./policy-engine";
import { createApprovalPayload } from "./data-access";
import type {
  AutonomyPolicyDecision,
  AutonomyPolicyRequest,
  ActionType,
  AutonomyLevel,
} from "./types";
import { capabilityRisk } from "./risk-mapping";

/**
 * Map connector capability to a policy action type.
 * For now, we classify by mode (read=routine, write=approval-or-destructive).
 * In future, could be more granular per-capability.
 */
function capabilityToAction(connectorId: string, capability: ConnectorCapability): ActionType {
  // For now, treat as generic connector action
  // In practice, could map specific capabilities like "github.merge_pull_request" -> "merge_pull_request"
  return capability.mode === "read" ? "open_pull_request" : "merge_pull_request"; // Placeholder
}

/**
 * Evaluate autonomy policy for a connector capability.
 *
 * This is the NEW entry point that replaces the scattered checks in connector-runtime.ts.
 * Returns a policy decision; the caller decides whether to execute, pause, or block.
 */
export async function evaluateConnectorCapabilityPolicy(
  userId: string,
  companyId: string | null,
  connectorId: string,
  capabilityId: string,
  capability: ConnectorCapability,
  autonomyLevel: AutonomyLevel,
  params?: Record<string, unknown>,
): Promise<AutonomyPolicyDecision> {
  // Determine the action type (could be more granular in future)
  const action = capabilityToAction(connectorId, capability);

  // Get applicable Founder directives
  // For connectors, directives might not map 1:1 to agent/domain,
  // so we might return empty here. This is a TODO for connector-specific directives.
  const directives = []; // TODO: lookup connector-specific directives

  // Build the policy request
  const request: AutonomyPolicyRequest = {
    actor: "agent", // Connector actions are initiated by agents
    agent: "harmony", // For now, all connectors are orchestrated by Harmony
    domain: "operations", // Placeholder; could be more specific per connector
    action,
    current_autonomy_level: autonomyLevel,
    applicable_directives: directives,
    params: params ?? {},
  };

  // Evaluate the policy
  return evaluateAutonomyPolicy(request);
}

/**
 * Integrate with the existing connector runtime.
 *
 * This would be called from connector-runtime.ts instead of the current
 * inline risk check logic. It returns structured guidance on what to do.
 */
export async function validateConnectorCapabilityExecution(
  userId: string,
  companyId: string | null,
  connectorId: string,
  capabilityId: string,
  capability: ConnectorCapability,
  autonomyLevel: AutonomyLevel,
  params?: Record<string, unknown>,
): Promise<{
  can_execute: boolean;
  can_execute_now: boolean; // false if approval_required
  needs_approval: boolean;
  is_blocked: boolean;
  approval_id?: string;
  reason: string;
}> {
  const decision = await evaluateConnectorCapabilityPolicy(
    userId,
    companyId,
    connectorId,
    capabilityId,
    capability,
    autonomyLevel,
    params,
  );

  if (canExecute(decision)) {
    return {
      can_execute: true,
      can_execute_now: true,
      needs_approval: false,
      is_blocked: false,
      reason: decision.reason,
    };
  }

  if (needsApproval(decision)) {
    // Create and persist the approval payload
    if (decision.approval_payload) {
      const stored = await createApprovalPayload(userId, companyId, decision.approval_payload);
      return {
        can_execute: true, // CAN execute (eventually, after approval)
        can_execute_now: false, // But NOT RIGHT NOW
        needs_approval: true,
        is_blocked: false,
        approval_id: stored?.approval_id,
        reason: decision.reason,
      };
    }
  }

  if (isBlocked(decision)) {
    return {
      can_execute: false,
      can_execute_now: false,
      needs_approval: false,
      is_blocked: true,
      reason: decision.reason,
    };
  }

  // Fallback
  return {
    can_execute: false,
    can_execute_now: false,
    needs_approval: false,
    is_blocked: true,
    reason: "Unknown policy state",
  };
}
