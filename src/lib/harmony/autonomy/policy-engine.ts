/**
 * Unified Autonomy Policy Engine — Core decision logic.
 *
 * The single source of truth for all autonomy/approval decisions.
 * Replaces scattered logic in:
 *  - src/lib/harmony/os/autonomy.ts
 *  - src/lib/harmony/os/execution.ts
 *  - src/lib/integrations/connector-runtime.ts
 *  - src/lib/harmony/code/mason-*.ts
 *
 * Pure function; no I/O. Depends only on types + utility functions.
 */

import type {
  AutonomyActor,
  AutonomyAgent,
  AutonomyDomain,
  ActionType,
  AutonomyLevel,
  FounderDirective,
  AutonomyPolicyRequest,
  AutonomyPolicyDecision,
  ApprovalPayload,
  ExecutionScope,
  AutonomyAuditMetadata,
} from "./types";
import { DEFAULT_APPROVAL_SLAS } from "./types";
import { resolveMasonCapability } from "@/lib/harmony/autonomy/mason-integration";
import {
  validateFounderOperationalRequest,
  type FounderOperationalRequest,
} from "@/lib/founder-runtime-contract";
import { actionRiskClass, requiresApprovalOrHigher, isDestructive } from "./risk-mapping";
import {
  canExecuteRoutineAtLevel,
  canExecuteApprovalActionsAtLevel,
  canBypassApprovalForDestructive,
  autonomyLevelName,
} from "./autonomy-levels";

/**
 * Default execution scopes per autonomy level.
 * Higher levels get fewer constraints.
 */
const DEFAULT_EXECUTION_SCOPES: Record<AutonomyLevel, ExecutionScope> = {
  0: { max_concurrent_actions: 1, rate_limit_per_minute: 1, context_validity_seconds: 300 },
  1: { max_concurrent_actions: 2, rate_limit_per_minute: 3, context_validity_seconds: 600 },
  2: { max_concurrent_actions: 5, rate_limit_per_minute: 10, context_validity_seconds: 900 },
  3: { max_concurrent_actions: 20, rate_limit_per_minute: 30, context_validity_seconds: 1800 },
  4: { max_concurrent_actions: 100, rate_limit_per_minute: 60, context_validity_seconds: 3600 },
};

/**
 * Evaluate whether a Founder directive explicitly allows or denies an action.
 *
 * Returns: "allowed", "denied", or null (no directive applies).
 */
function evaluateDirective(
  action: ActionType,
  directives: FounderDirective[] | undefined,
): "allowed" | "denied" | null {
  if (!directives || directives.length === 0) return null;

  const applicableDirective = directives.find((d) => d.status === "active");
  if (!applicableDirective) return null;

  // Explicitly denied takes precedence
  if (applicableDirective.denied_actions.includes(action)) return "denied";

  // Explicitly allowed
  if (applicableDirective.allowed_actions.includes(action)) return "allowed";

  // No specific directive
  return null;
}

/**
 * Determine if a context is fresh enough to execute (not stale).
 * For now, just checks if any required context is explicitly null/undefined.
 * In practice, this would validate that branches exist, files haven't been deleted, etc.
 */
function isContextValid(context: Record<string, unknown> | undefined): boolean {
  if (!context) return true; // No context to validate
  // TODO: In production, validate that branches exist, repos are accessible, etc.
  return !Object.values(context).some((v) => v === null || v === undefined);
}

/**
 * Evaluate the autonomy policy for a requested action.
 *
 * Returns a decision: execute, approval_required, or blocked.
 * Includes reasoning and audit metadata.
 */
export function evaluateAutonomyPolicy(request: AutonomyPolicyRequest): AutonomyPolicyDecision {
  const riskClass = actionRiskClass(request.action);
  const isDestr = isDestructive(request.action);
  const directiveResult = evaluateDirective(request.action, request.applicable_directives);

  const riskFactors: string[] = [];
  if (isDestr) riskFactors.push("destructive_action");
  if (request.current_autonomy_level < 3) riskFactors.push("low_autonomy_level");
  if (directiveResult === "denied") riskFactors.push("founder_directive_denied");

  const auditMetadata: AutonomyAuditMetadata = {
    policy_version: "1.0",
    evaluated_at: new Date().toISOString(),
    applicable_directives: request.applicable_directives?.map((d) => d.id) ?? [],
    risk_factors: riskFactors,
    autonomy_level: request.current_autonomy_level,
    actor_authority: `${request.actor}/${request.agent}`,
  };

  // Rule 1: Founder directives are the highest authority
  if (directiveResult === "allowed") {
    auditMetadata.actor_authority = "founder_directive_allowed";
    return {
      decision: "execute",
      reason: `Founder explicitly authorized ${request.agent} to ${request.action} in ${request.domain}.`,
      execution_scope: DEFAULT_EXECUTION_SCOPES[request.current_autonomy_level],
      audit: auditMetadata,
    };
  }

  if (directiveResult === "denied") {
    auditMetadata.actor_authority = "founder_directive_denied";
    return {
      decision: "blocked",
      reason: `Founder explicitly denied ${request.agent} from ${request.action}. This action is blocked.`,
      audit: auditMetadata,
    };
  }

  // Rule 2: Destructive actions always require approval, regardless of autonomy level
  if (isDestr) {
    auditMetadata.actor_authority = "destructive_action_requires_approval";
    return {
      decision: "approval_required",
      reason: `Action ${request.action} is destructive and always requires Founder approval.`,
      approval_payload: buildApprovalPayload(request),
      approval_sla: DEFAULT_APPROVAL_SLAS.destructive,
      escalation_path: "assign_to_founder",
      audit: auditMetadata,
    };
  }

  // Rule 3: Routine actions can execute if autonomy level permits
  if (riskClass === "routine") {
    if (canExecuteRoutineAtLevel(request.current_autonomy_level)) {
      auditMetadata.actor_authority = `autonomy_level_${request.current_autonomy_level}_allows_routine`;
      return {
        decision: "execute",
        reason: `${autonomyLevelName(request.current_autonomy_level)} (level ${request.current_autonomy_level}) can execute routine actions like ${request.action}.`,
        execution_scope: DEFAULT_EXECUTION_SCOPES[request.current_autonomy_level],
        audit: auditMetadata,
      };
    }

    // Low autonomy level cannot execute even routine actions
    auditMetadata.actor_authority = "low_autonomy_level_blocks_routine";
    return {
      decision: "approval_required",
      reason: `${autonomyLevelName(request.current_autonomy_level)} (level ${request.current_autonomy_level}) requires Founder approval for all actions, including routine ones.`,
      approval_payload: buildApprovalPayload(request),
      approval_sla: DEFAULT_APPROVAL_SLAS.approval,
      escalation_path: "assign_to_founder",
      audit: auditMetadata,
    };
  }

  // Rule 4: Approval-level actions
  if (riskClass === "approval") {
    // Executive level (4) can bypass approval for approval-level actions
    if (canExecuteApprovalActionsAtLevel(request.current_autonomy_level)) {
      auditMetadata.actor_authority = "autonomy_level_4_executive_bypass";
      return {
        decision: "execute",
        reason: `${autonomyLevelName(request.current_autonomy_level)} (level ${request.current_autonomy_level}) can execute approval-level actions autonomously.`,
        execution_scope: DEFAULT_EXECUTION_SCOPES[request.current_autonomy_level],
        audit: auditMetadata,
      };
    }

    // All other levels require approval
    auditMetadata.actor_authority = "approval_required_by_autonomy_level";
    return {
      decision: "approval_required",
      reason: `${autonomyLevelName(request.current_autonomy_level)} (level ${request.current_autonomy_level}) requires Founder approval for ${request.action}.`,
      approval_payload: buildApprovalPayload(request),
      approval_sla: DEFAULT_APPROVAL_SLAS.approval,
      escalation_path: "assign_to_founder",
      audit: auditMetadata,
    };
  }

  // Fallback (should not reach here)
  auditMetadata.actor_authority = "policy_engine_error";
  return {
    decision: "blocked",
    reason: `Policy engine could not classify ${request.action}. Defaulting to blocked for safety.`,
    audit: auditMetadata,
  };
}

/**
 * Build an approval payload for actions that need approval.
 * Must include all context needed to resume execution later.
 */
function buildApprovalPayload(request: AutonomyPolicyRequest): ApprovalPayload {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
  const founderRuntimeRequest = buildFounderRuntimeRequest(request, now);

  return {
    approval_id: `approval_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    original_actor: request.actor,
    original_agent: request.agent,
    original_domain: request.domain,
    original_action: request.action,
    original_params: request.params ?? {},
    required_context: request.params?.context ?? {},
    ...(founderRuntimeRequest ? { founderRuntimeRequest } : {}),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

function buildFounderRuntimeRequest(
  request: AutonomyPolicyRequest,
  createdAt: Date,
): FounderOperationalRequest | undefined {
  if (request.agent !== "mason" || request.actor !== "harmony" || request.domain !== "engineering") {
    return undefined;
  }

  const taskContract = request.params?.taskContract as
    | {
        requestedOutcome?: unknown;
        objective?: unknown;
        executionIdentity?: { requestId?: unknown; executionId?: unknown; correlationId?: unknown };
      }
    | undefined;
  if (!taskContract) {
    return undefined;
  }

  const requestedOutcome = taskContract.requestedOutcome;
  const resolution = resolveMasonCapability(requestedOutcome);
  if (resolution.status === "non_execution") {
    return undefined;
  }
  if (resolution.status !== "executable") {
    throw new Error("Mason executable approval requires an executable capability resolution");
  }

  const requestId =
    typeof taskContract.executionIdentity?.requestId === "string" && taskContract.executionIdentity.requestId.trim()
      ? taskContract.executionIdentity.requestId.trim()
      : typeof taskContract.executionIdentity?.executionId === "string"
        ? taskContract.executionIdentity.executionId.trim()
        : "";
  if (!requestId) {
    throw new Error("Mason executable approval requires executionIdentity.requestId");
  }

  const correlationId = typeof taskContract.executionIdentity?.correlationId === "string"
    ? taskContract.executionIdentity.correlationId.trim()
    : "";
  if (!correlationId) {
    throw new Error("Mason executable approval requires executionIdentity.correlationId");
  }

  const founderId = typeof (request.params as { executionIdentity?: { userId?: unknown } } | undefined)?.executionIdentity?.userId === "string"
    ? (
        ((request.params as { executionIdentity?: { userId?: string } }).executionIdentity?.userId ?? "").trim()
      )
    : "";
  if (!founderId) {
    throw new Error("Mason executable approval requires policy-flow userId");
  }

  const intent = typeof taskContract.objective === "string" ? taskContract.objective : "";
  const founderRequest: FounderOperationalRequest = {
    requestId,
    correlationId,
    founderId,
    source: "approval_center",
    intent,
    requestedAction: String(requestedOutcome),
    targetAgent: "mason",
    capabilityId: resolution.capabilityId,
    payload: request.params ?? {},
    approvalRequirement: "required",
    submittedAt: createdAt.toISOString(),
  };

  const validation = validateFounderOperationalRequest(founderRequest);
  if (!validation.ok) {
    throw new Error(`FounderOperationalRequest validation failed: ${validation.error}`);
  }
  return founderRequest;
}

/**
 * Check if a policy decision is ready to execute.
 */
export function canExecute(decision: AutonomyPolicyDecision): boolean {
  return decision.decision === "execute";
}

/**
 * Check if a policy decision requires approval.
 */
export function needsApproval(decision: AutonomyPolicyDecision): boolean {
  return decision.decision === "approval_required";
}

/**
 * Check if a policy decision is blocked.
 */
export function isBlocked(decision: AutonomyPolicyDecision): boolean {
  return decision.decision === "blocked";
}
