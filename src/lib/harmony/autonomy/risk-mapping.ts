/**
 * Unified Autonomy Policy Engine — Risk classification.
 *
 * Maps actions to risk classes and governs default behavior.
 * This is the source of truth that replaces scattered risk checks
 * throughout connector-runtime.ts, mason-*.ts, and execution.ts.
 */

import type { ActionType, RiskClass } from "./types";

/**
 * Risk classification per action.
 * - routine: executes autonomously (owner-scoped + audited)
 * - approval: held for founder approval before executing
 * - destructive: held for founder approval AND flagged high-risk
 */
const ACTION_RISK_MAP: Record<ActionType, RiskClass> = {
  // Engineering: reads and safe writes are routine; risky operations need approval
  create_branch: "routine",
  commit_file: "routine",
  open_pull_request: "routine",
  create_issue: "routine",
  merge_pull_request: "approval", // Not inherently destructive, but risky (code goes live)
  deploy_production: "approval", // Non-destructive deployments still need visibility
  delete_repository: "destructive", // Irreversible

  // Content: drafting is routine; publishing requires approval
  draft_content: "routine",
  generate_media: "routine",
  publish_externally: "approval", // External-facing, needs review
  delete_published_content: "approval", // Might break external links

  // Knowledge: internal writes are routine; deletion requires approval
  write_memory: "routine",
  update_documentation: "routine",
  delete_memory: "approval", // Could break organizational continuity

  // Analytics: analysis and reporting are routine
  generate_report: "routine",
  analyze_metrics: "routine",

  // Communications: internal is routine; external needs approval
  draft_message: "routine",
  send_internal_notification: "routine",
  send_external_message: "approval", // Customer-facing, needs review
  publish_announcement: "approval", // Org-wide, high visibility

  // Operations: coordination is routine
  assign_work: "routine",
  delegate_task: "routine",
  coordinate_agents: "routine",
};

/**
 * Get the risk class for an action.
 */
export function actionRiskClass(action: ActionType): RiskClass {
  return ACTION_RISK_MAP[action];
}

/**
 * Whether an action is destructive (irreversible).
 */
export function isDestructive(action: ActionType): boolean {
  return actionRiskClass(action) === "destructive";
}

/**
 * Whether an action requires approval (either approval or destructive).
 */
export function requiresApprovalOrHigher(action: ActionType): boolean {
  const risk = actionRiskClass(action);
  return risk === "approval" || risk === "destructive";
}

/**
 * Classify a connector capability (read/write mode) to risk.
 * Used for legacy connector capabilities that may not have explicit risk.
 *
 * Default: read → routine, write → approval
 * (Specific capabilities can override via ActionType mapping.)
 */
export function capabilityRisk(
  mode: "read" | "write",
  explicitRisk?: RiskClass,
): RiskClass {
  if (explicitRisk) return explicitRisk;
  return mode === "read" ? "routine" : "approval";
}
