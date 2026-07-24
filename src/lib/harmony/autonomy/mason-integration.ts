/**
 * Unified Autonomy Policy Engine — Mason runtime integration.
 *
 * Replaces scattered approval logic in:
 *  - src/lib/harmony/code/mason-execution-bridge.ts
 *  - src/lib/harmony/code/mason-production-runtime.ts
 *  - src/lib/harmony/code/mason-runtime-executor.ts
 *
 * All Mason execution decisions now route through the central policy engine.
 */

import "server-only";

import { getActiveDirectives, createApprovalPayload } from "./data-access";
import { evaluateAutonomyPolicy, canExecute, needsApproval, isBlocked } from "./policy-engine";
import type {
  AutonomyPolicyDecision,
  AutonomyPolicyRequest,
  ActionType,
  AutonomyLevel,
} from "./types";
import type { MasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";

export interface MasonExecutionGovernanceContext {
  taskContract: MasonEngineeringTaskContract;
}

/**
 * Map a Mason objective (e.g., "create PR", "merge") to an action type.
 */
function masonObjectiveToAction(objective: string): ActionType {
  const lower = objective.toLowerCase();

  const readOnlyIntent =
    /\b(read[- ]?only|diagnostic\s+only|explain\s+only|report\s+only|respond\s+only|acknowledge\s+only)\b/.test(lower) ||
    /\bdo\s+not\s+(execute|deploy|modify|create|open\s+(?:a\s+)?(?:pr|pull\s+request))\b/.test(lower);

  const deployIntent =
    /\bdeploy\s+to\s+production\b/.test(lower) ||
    /\brelease\s+to\s+production\b/.test(lower) ||
    /\bpromote\s+to\s+production\b/.test(lower) ||
    /\bexecute\s+production\s+deployment\b/.test(lower);

  if (lower.includes("merge")) return "merge_pull_request";
  if (deployIntent && !readOnlyIntent) return "deploy_production";
  if (lower.includes("branch")) return "create_branch";
  if (lower.includes("commit")) return "commit_file";
  if (lower.includes("pr") || lower.includes("pull request")) return "open_pull_request";
  if (lower.includes("issue")) return "create_issue";
  if (lower.includes("delete") || lower.includes("destroy")) return "delete_repository";
  return "commit_file"; // Default
}

/**
 * Evaluate autonomy policy for a Mason execution request.
 *
 * This replaces the scattered approval checks in mason-execution-bridge.ts
 * and ensures Mason uses the same policy engine as all other agents.
 */
export async function evaluateMasonExecutionPolicy(
  userId: string,
  companyId: string | null,
  objective: string,
  repository: string,
  autonomyLevel: AutonomyLevel,
  founderApproved?: boolean,
  governance?: MasonExecutionGovernanceContext,
): Promise<AutonomyPolicyDecision> {
  // Determine the action
  const action = governance
    ? governance.taskContract.requestedOutcome === "create_issue"
      ? "create_issue"
      : governance.taskContract.requestedOutcome === "create_branch"
        ? "create_branch"
        : governance.taskContract.requestedOutcome === "open_pull_request"
          ? "open_pull_request"
          : "commit_file"
    : masonObjectiveToAction(objective);

  // Get active Founder directives for Mason in engineering domain
  const directives = await getActiveDirectives(userId, companyId, "mason", "engineering");

  if (governance?.taskContract.requestedOutcome === "plan_only") {
    return {
      decision: "execute",
      reason: "Read-only grounded planning does not request repository mutation.",
      audit: {
        policy_version: "1.0",
        evaluated_at: new Date().toISOString(),
        applicable_directives: directives.map((directive) => directive.id),
        risk_factors: ["read_only_planning"],
        autonomy_level: autonomyLevel,
        actor_authority: "founder_read_only_request",
      },
    };
  }

  // If already Founder-approved (e.g., from a previous approval), always allow
  if (founderApproved) {
    return {
      decision: "execute",
      reason: `Founder previously approved Mason to ${action}. Resuming execution.`,
      audit: {
        policy_version: "1.0",
        evaluated_at: new Date().toISOString(),
        applicable_directives: directives.map((d) => d.id),
        risk_factors: ["founder_approved"],
        autonomy_level: autonomyLevel,
        actor_authority: "founder_approval_resume",
      },
    };
  }

  // Build the policy request
  const request: AutonomyPolicyRequest = {
    actor: "harmony", // Harmony routes work to Mason
    agent: "mason",
    domain: "engineering",
    action,
    current_autonomy_level: governance?.taskContract.approvalRequirements.required ? 0 : autonomyLevel,
    applicable_directives: directives,
    params: {
      objective,
      repository,
      executionIdentity: governance?.taskContract.executionIdentity ?? null,
      taskContract: governance?.taskContract ?? null,
      protectedResources: governance?.taskContract.protectedResources ?? [],
      context: {
        branch: undefined, // Will be known at execution time
        file_paths: undefined,
      },
    },
  };

  // Evaluate the policy
  return evaluateAutonomyPolicy(request);
}

/**
 * Integrate with the existing Mason execution flow.
 *
 * This replaces calls to createMasonExecutionBridge() with a policy-driven approach.
 */
export async function determineMasonExecutionReadiness(
  userId: string,
  companyId: string | null,
  objective: string,
  repository: string,
  autonomyLevel: AutonomyLevel,
  founderApproved?: boolean,
  governance?: MasonExecutionGovernanceContext,
): Promise<{
  ready_to_execute: boolean;
  ready_now: boolean;
  requires_approval: boolean;
  is_blocked: boolean;
  approval_id?: string;
  reason: string;
}> {
  const decision = await evaluateMasonExecutionPolicy(
    userId,
    companyId,
    objective,
    repository,
    autonomyLevel,
    founderApproved,
    governance,
  );

  if (canExecute(decision)) {
    return {
      ready_to_execute: true,
      ready_now: true,
      requires_approval: false,
      is_blocked: false,
      reason: decision.reason,
    };
  }

  if (needsApproval(decision)) {
    if (decision.approval_payload) {
      const stored = await createApprovalPayload(userId, companyId, decision.approval_payload);
      return {
        ready_to_execute: true,
        ready_now: false,
        requires_approval: true,
        is_blocked: false,
        approval_id: stored?.approval_id,
        reason: decision.reason,
      };
    }
  }

  if (isBlocked(decision)) {
    return {
      ready_to_execute: false,
      ready_now: false,
      requires_approval: false,
      is_blocked: true,
      reason: decision.reason,
    };
  }

  return {
    ready_to_execute: false,
    ready_now: false,
    requires_approval: false,
    is_blocked: true,
    reason: "Unknown Mason execution state",
  };
}

/**
 * Mason-specific action validation (replaces hardcoded checks in mason-execution-bridge).
 */
export function validateMasonAction(
  action: ActionType,
): { allowed: boolean; reason: string } {
  const blockedActions: ActionType[] = [
    "delete_repository", // Mason never deletes repos
  ];

  if (blockedActions.includes(action)) {
    return {
      allowed: false,
      reason: `Mason is not permitted to ${action}. This is a Founder-only destructive action.`,
    };
  }

  return { allowed: true, reason: "Action is within Mason's scope." };
}
