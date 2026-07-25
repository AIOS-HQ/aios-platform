/**
 * Unified Autonomy Policy Engine — Type definitions.
 *
 * Defines all actor, domain, action, and decision types used by the central
 * policy engine. This is the single source of truth for autonomy classification.
 * Pure, dependency-free, and client-safe.
 */

/**
 * Who gave the instruction that triggered this action.
 */
export type AutonomyActor = "founder" | "harmony" | "agent" | "scheduled";

/**
 * All AIOS workforce agents (specialists + coordinator).
 */
export type AutonomyAgent =
  | "mason" // Engineering
  | "catalyst" // Content & Growth
  | "atlas" // Knowledge
  | "pulse" // Analytics
  | "ambassador" // Communications
  | "harmony"; // Coordinator

/**
 * Business domains, mapped 1:1 to agents.
 */
export type AutonomyDomain =
  | "engineering"
  | "content"
  | "knowledge"
  | "analytics"
  | "communications"
  | "operations";

/**
 * Map domain to agent (e.g., "engineering" → "mason").
 */
export const DOMAIN_TO_AGENT: Record<AutonomyDomain, AutonomyAgent> = {
  engineering: "mason",
  content: "catalyst",
  knowledge: "atlas",
  analytics: "pulse",
  communications: "ambassador",
  operations: "harmony",
};

export function domainAgent(domain: AutonomyDomain): AutonomyAgent {
  return DOMAIN_TO_AGENT[domain];
}

/**
 * Types of actions an agent can perform.
 */
export type ActionType =
  // Engineering (Mason)
  | "create_branch"
  | "commit_file"
  | "open_pull_request"
  | "create_issue"
  | "merge_pull_request"
  | "deploy_production"
  | "delete_repository"

  // Content (Catalyst)
  | "draft_content"
  | "generate_media"
  | "publish_externally"
  | "delete_published_content"

  // Knowledge (Atlas)
  | "write_memory"
  | "update_documentation"
  | "delete_memory"

  // Analytics (Pulse)
  | "generate_report"
  | "analyze_metrics"

  // Communications (Ambassador)
  | "draft_message"
  | "send_internal_notification"
  | "send_external_message"
  | "publish_announcement"

  // Operations (Harmony)
  | "assign_work"
  | "delegate_task"
  | "coordinate_agents";

/**
 * Risk classification: governs whether action executes autonomously,
 * requires approval, or is blocked entirely.
 */
export type RiskClass = "routine" | "approval" | "destructive";

/**
 * Autonomy level (0-4) governs the agent's default authority.
 * Combines with action risk class and Founder directives to yield final decision.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export const AUTONOMY_LEVEL_NAMES: Record<AutonomyLevel, string> = {
  0: "Manual",
  1: "Assisted",
  2: "Supervised",
  3: "Autonomous",
  4: "Executive Autonomous",
};

export function autonomyLevelName(level: AutonomyLevel): string {
  return AUTONOMY_LEVEL_NAMES[level];
}

/**
 * Founder directive: explicit permission for an agent to act in a domain.
 * Directives can expire and be delegated to approvers.
 */
export type FounderDirectiveStatus = "active" | "expired" | "revoked";

export interface FounderDirective {
  id: string;
  founder_id: string;
  agent: AutonomyAgent;
  domain: AutonomyDomain;
  allowed_actions: ActionType[];
  denied_actions: ActionType[];
  max_concurrent_actions?: number;
  rate_limit_per_minute?: number;
  status: FounderDirectiveStatus;
  granted_at: string;
  expires_at?: string;
  delegated_to_approver?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Autonomous scope: the set of permissions an agent has within a domain.
 * Derived from autonomy level + Founder directives.
 */
export interface AutonomousScope {
  agent: AutonomyAgent;
  domain: AutonomyDomain;
  autonomy_level: AutonomyLevel;
  can_execute_routinely: ActionType[];
  requires_approval: ActionType[];
  blocked: ActionType[];
  directives_applied: string[];
  valid_until?: string;
}

/**
 * Approval SLA: time limits and escalation for different risk levels.
 */
export interface ApprovalSLA {
  risk_level: "approval" | "destructive";
  max_wait_hours: number;
  auto_reject_on_timeout: boolean;
  escalation_targets?: string[];
}

export const DEFAULT_APPROVAL_SLAS: Record<"approval" | "destructive", ApprovalSLA> = {
  approval: {
    risk_level: "approval",
    max_wait_hours: 24,
    auto_reject_on_timeout: false,
  },
  destructive: {
    risk_level: "destructive",
    max_wait_hours: 72,
    auto_reject_on_timeout: false,
  },
};

/**
 * Payload saved when an action requires approval and is paused.
 * Must include all context needed to resume execution later.
 */
export interface ApprovalPayload {
  approval_id: string;
  original_actor: AutonomyActor;
  original_agent: AutonomyAgent;
  original_domain: AutonomyDomain;
  original_action: ActionType;
  original_params: Record<string, unknown>;

  // Context needed to validate the action is still valid
  required_context: {
    branch?: string;
    repository?: string;
    file_paths?: string[];
    target_state?: Record<string, unknown>;
  };

  created_at: string;
  expires_at: string;
}

/**
 * Audit metadata attached to every policy decision.
 */
export interface AutonomyAuditMetadata {
  policy_version: string;
  evaluated_at: string;
  applicable_directives: string[];
  risk_factors: string[];
  autonomy_level: AutonomyLevel;
  actor_authority: string; // e.g., "founder_directive", "autonomy_level_3", "routine_capability"
}

/**
 * Execution scope: constraints on how many concurrent actions and rate limits.
 */
export interface ExecutionScope {
  max_concurrent_actions: number;
  rate_limit_per_minute: number;
  context_validity_seconds: number;
}

/**
 * The central autonomy policy decision.
 * Returned by the policy engine; consumed by execution runtimes.
 */
export interface AutonomyPolicyDecision {
  // The core decision
  decision: "execute" | "approval_required" | "blocked";
  reason: string;

  // If EXECUTE
  execution_scope?: ExecutionScope;

  // If APPROVAL_REQUIRED or BLOCKED
  approval_payload?: ApprovalPayload;
  approval_sla?: ApprovalSLA;
  escalation_path?: string; // e.g., "assign_to_founder" or "delegate_to_approver"

  // Audit trail
  audit: AutonomyAuditMetadata;
}

/**
 * Execution result: what happened after the policy decision.
 * Returned by runtimes and stored in audit tables.
 */
export interface ExecutionResult {
  execution_id: string;
  request_id?: string;
  correlation_id?: string;
  agent: AutonomyAgent;
  domain: AutonomyDomain;
  action: ActionType;
  status: "completed" | "pending_approval" | "blocked" | "failed";

  // Approval journey
  required_approval: boolean;
  approval_id?: string;
  founder_approved_at?: string;

  // Outcome
  completed_at?: string;
  result_data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };

  // Audit & retention
  created_at: string;
  expires_at: string;

  // Where this result was published
  emitted_to: ("activity_feed" | "review_queue" | "julius_memory" | "company_skills")[];
}

/**
 * Request to the policy engine: what decision should be made?
 */
export interface AutonomyPolicyRequest {
  actor: AutonomyActor;
  agent: AutonomyAgent;
  domain: AutonomyDomain;
  action: ActionType;
  current_autonomy_level: AutonomyLevel;
  applicable_directives?: FounderDirective[];
  params?: Record<string, unknown>;
}
