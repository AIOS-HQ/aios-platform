/**
 * Unified Autonomy Policy Engine — Mason runtime bridge (pure).
 *
 * Maps Mason live-execution connector operations onto the engine's ActionType +
 * RiskClass so the Mason runtime (`mason-live-execution.ts` and
 * `mason-runtime-executor.ts`) makes every approval / gating decision from the
 * SAME source of truth as the rest of the workforce — instead of the local
 * ad-hoc heuristics it used before (`isMutationOperation`, `isMergeOrDestructive`).
 *
 * Pure and dependency-free (types + risk-mapping only): client-safe and
 * unit-testable without a database.
 */

import type { ActionType, RiskClass } from "./types";
import { actionRiskClass, isDestructive } from "./risk-mapping";

/**
 * Actions Mason may never perform, regardless of approval. Mirrors
 * `validateMasonAction` in `./mason-integration` — repository deletion is a
 * Founder-only destructive action outside Mason's scope.
 */
const MASON_FORBIDDEN_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "delete_repository",
]);

/**
 * Map a Mason live-execution operation (its `kind` + connector `capabilityId`)
 * to the central engine `ActionType`. Returns `null` for internal orchestration
 * operations (validation requests, Vercel status checks, Harmony reporting) that
 * are not governed engineering write actions.
 *
 * High-risk hints (delete / merge / production deploy) take precedence over the
 * base kind so a mislabeled capability can never smuggle a destructive or merge
 * action past the engine.
 */
export function masonActionForOperation(
  kind: string,
  capabilityId: string,
): ActionType | null {
  // Normalize separators to spaces so `_`/`-`/`/`-joined tokens (e.g.
  // "delete_repository", "merge_pull_request") match on real word boundaries.
  const hay = `${kind} ${capabilityId}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");

  if (/\b(?:delete|destroy|drop|wipe|teardown)\b/.test(hay)) return "delete_repository";
  if (/\bmerge\b/.test(hay)) return "merge_pull_request";
  if (/\bdeploy production\b|\bproduction deploy\b|\bpromote production\b/.test(hay)) {
    return "deploy_production";
  }

  switch (kind) {
    case "github_create_branch":
      return "create_branch";
    case "github_commit_file":
      return "commit_file";
    case "github_open_pull_request":
      return "open_pull_request";
    case "github_create_issue":
      return "create_issue";
    default:
      return null;
  }
}

export interface MasonOperationClassification {
  /** Engine action, or null for internal (non-governed) orchestration ops. */
  action: ActionType | null;
  /** True when the operation maps to a governed engineering write action. */
  governed: boolean;
  risk: RiskClass;
  destructive: boolean;
  /** approval- or destructive-class → needs Founder approval before running. */
  requiresApproval: boolean;
  /** False for actions Mason may never perform (e.g., delete_repository). */
  allowedForMason: boolean;
}

/**
 * Classify a Mason operation through the central engine risk map. Internal
 * (non-governed) operations are treated as routine and always allowed.
 */
export function classifyMasonOperation(
  kind: string,
  capabilityId: string,
): MasonOperationClassification {
  const action = masonActionForOperation(kind, capabilityId);

  if (!action) {
    return {
      action: null,
      governed: false,
      risk: "routine",
      destructive: false,
      requiresApproval: false,
      allowedForMason: true,
    };
  }

  const risk = actionRiskClass(action);
  return {
    action,
    governed: true,
    risk,
    destructive: isDestructive(action),
    requiresApproval: risk !== "routine",
    allowedForMason: !MASON_FORBIDDEN_ACTIONS.has(action),
  };
}

export interface MasonOperationGateInput {
  kind: string;
  capabilityId: string;
  approved: boolean;
}

export interface MasonOperationGateResult {
  allow: boolean;
  reason: string;
  classification: MasonOperationClassification;
}

/**
 * The single execution gate for a Mason connector operation, sourced entirely
 * from the policy engine. Used by `mason-runtime-executor` before running any
 * operation:
 *  - forbidden actions (delete_repository) are always blocked;
 *  - destructive actions are never executed by the runtime;
 *  - approval-class actions (merge, production deploy) require Founder approval;
 *  - governed writes require an approved execution scope;
 *  - internal orchestration operations always pass.
 */
export function evaluateMasonOperationGate(
  input: MasonOperationGateInput,
): MasonOperationGateResult {
  const classification = classifyMasonOperation(input.kind, input.capabilityId);
  const { action, governed, destructive, requiresApproval, allowedForMason } =
    classification;

  if (!governed) {
    return {
      allow: true,
      reason: "Internal Mason orchestration operation.",
      classification,
    };
  }

  if (!allowedForMason) {
    return {
      allow: false,
      reason: `Policy engine: Mason is not permitted to ${action}; it is a Founder-only destructive action.`,
      classification,
    };
  }

  if (destructive) {
    return {
      allow: false,
      reason: `Policy engine: ${action} is destructive and cannot be executed by the Mason runtime.`,
      classification,
    };
  }

  if (requiresApproval && !input.approved) {
    return {
      allow: false,
      reason: `Policy engine: ${action} requires Founder approval before execution.`,
      classification,
    };
  }

  if (!input.approved) {
    return {
      allow: false,
      reason: `Policy engine: Mason mutation ${action} requires a Founder-approved execution scope.`,
      classification,
    };
  }

  return {
    allow: true,
    reason: `Policy engine: ${action} authorized for execution.`,
    classification,
  };
}

/**
 * Decide the final `approved` flag for a planned operation given whether the
 * Founder approved the Mason execution scope. Governed routine writes inherit
 * scope approval; approval- or destructive-class actions are NEVER auto-approved
 * by scope (they must go through their own approval); internal operations keep
 * their original flag.
 */
export function resolveMasonOperationApproval(
  kind: string,
  capabilityId: string,
  currentApproved: boolean,
  founderScopeApproved: boolean,
): boolean {
  const classification = classifyMasonOperation(kind, capabilityId);
  if (!classification.governed) return currentApproved;
  if (!classification.allowedForMason || classification.requiresApproval) return false;
  return founderScopeApproved;
}
