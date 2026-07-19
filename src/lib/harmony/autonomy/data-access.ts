/**
 * Unified Autonomy Policy Engine — Database layer.
 *
 * Typed data-access functions for persisting and querying:
 *  - Founder directives (permissions)
 *  - Approval payloads (paused executions)
 *  - Execution results (audit trail)
 *
 * Uses Supabase server client (RLS enforces owner/company scoping).
 * All functions are server-only.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  FounderDirective,
  ApprovalPayload,
  ExecutionResult,
  AutonomyActor,
  AutonomyAgent,
  AutonomyDomain,
  ActionType,
} from "./types";

/**
 * Database schema expectations:
 * - founder_directives: id, user_id, company_id, agent, domain, allowed_actions[], denied_actions[], status, granted_at, expires_at, delegated_to_approver, created_at, updated_at
 * - approval_payloads: id, user_id, company_id, approval_id, original_agent, original_action, original_params, required_context, created_at, expires_at, status, founder_approved_at, rejection_reason
 * - execution_results: id, user_id, company_id, execution_id, agent, domain, action, status, approval_id, completed_at, result_data, error, created_at, expires_at, emitted_to[]
 *
 * All tables have RLS that scopes rows to (user_id, company_id).
 */

/**
 * Create a new Founder directive.
 */
export async function createFounderDirective(
  userId: string,
  companyId: string | null,
  directive: Omit<FounderDirective, "id" | "founder_id" | "created_at" | "updated_at">,
): Promise<FounderDirective | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("founder_directives")
    .insert({
      user_id: userId,
      company_id: companyId,
      founder_id: userId,
      agent: directive.agent,
      domain: directive.domain,
      allowed_actions: directive.allowed_actions,
      denied_actions: directive.denied_actions,
      max_concurrent_actions: directive.max_concurrent_actions,
      rate_limit_per_minute: directive.rate_limit_per_minute,
      status: directive.status,
      granted_at: directive.granted_at,
      expires_at: directive.expires_at,
      delegated_to_approver: directive.delegated_to_approver,
    })
    .select()
    .single();

  if (error) {
    console.error("[autonomy/db] createFounderDirective", error.message);
    return null;
  }

  return (data as FounderDirective) ?? null;
}

/**
 * Get active Founder directives for an agent + domain.
 */
export async function getActiveDirectives(
  userId: string,
  companyId: string | null,
  agent: AutonomyAgent,
  domain: AutonomyDomain,
): Promise<FounderDirective[]> {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("founder_directives")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("agent", agent)
    .eq("domain", domain)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("granted_at", { ascending: false });

  if (error) {
    console.error("[autonomy/db] getActiveDirectives", error.message);
    return [];
  }

  return (data as FounderDirective[]) ?? [];
}

/**
 * Revoke a Founder directive.
 */
export async function revokeDirective(
  userId: string,
  directiveId: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("founder_directives")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", directiveId)
    .eq("user_id", userId);

  if (error) {
    console.error("[autonomy/db] revokeDirective", error.message);
    return false;
  }

  return true;
}

/**
 * Save an approval payload (pause execution, await approval).
 */
export async function createApprovalPayload(
  userId: string,
  companyId: string | null,
  payload: ApprovalPayload,
): Promise<ApprovalPayload | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approval_payloads")
    .insert({
      user_id: userId,
      company_id: companyId,
      approval_id: payload.approval_id,
      original_actor: payload.original_actor,
      original_agent: payload.original_agent,
      original_domain: payload.original_domain,
      original_action: payload.original_action,
      original_params: payload.original_params,
      required_context: payload.required_context,
      created_at: payload.created_at,
      expires_at: payload.expires_at,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("[autonomy/db] createApprovalPayload", error.message);
    return null;
  }

  return (data as ApprovalPayload) ?? null;
}

/**
 * Get a pending approval payload by ID.
 */
export async function getApprovalPayload(
  userId: string,
  approvalId: string,
): Promise<ApprovalPayload | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approval_payloads")
    .select("*")
    .eq("user_id", userId)
    .eq("approval_id", approvalId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("[autonomy/db] getApprovalPayload", error.message);
    return null;
  }

  return (data as ApprovalPayload) ?? null;
}

/**
 * Load an approved payload for canonical post-approval resume.
 * This intentionally requires status=approved, so resume paths can execute
 * after persistence without re-entering pending-only lookup semantics.
 */
export async function getApprovedApprovalPayload(
  userId: string,
  approvalId: string,
): Promise<ApprovalPayload | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approval_payloads")
    .select("*")
    .eq("user_id", userId)
    .eq("approval_id", approvalId)
    .eq("status", "approved")
    .maybeSingle();

  if (error) {
    console.error("[autonomy/db] getApprovedApprovalPayload", error.message);
    return null;
  }

  return (data as ApprovalPayload | null) ?? null;
}

export async function getApprovalById(
  userId: string,
  approvalId: string,
): Promise<{ approval_id: string; status: string; founder_approved_at: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval_payloads")
    .select("approval_id,status,founder_approved_at")
    .eq("user_id", userId)
    .eq("approval_id", approvalId)
    .maybeSingle();

  if (error) {
    console.error("[autonomy/db] getApprovalById", error.message);
    return null;
  }
  return (data as { approval_id: string; status: string; founder_approved_at: string | null } | null) ?? null;
}

/**
 * List pending approvals for a user/company (for Review Queue).
 */
export async function listPendingApprovals(
  userId: string,
  companyId: string | null,
): Promise<ApprovalPayload[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("approval_payloads")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[autonomy/db] listPendingApprovals", error.message);
    return [];
  }

  return (data as ApprovalPayload[]) ?? [];
}

/**
 * Approve a pending approval payload.
 */
export async function approveApproval(
  userId: string,
  approvalId: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("approval_payloads")
    .update({
      status: "approved",
      founder_approved_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("approval_id", approvalId)
    .eq("status", "pending");

  if (error) {
    console.error("[autonomy/db] approveApproval", error.message);
    return false;
  }

  return true;
}

/**
 * Reject a pending approval payload.
 */
export async function rejectApproval(
  userId: string,
  approvalId: string,
  reason: string,
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("approval_payloads")
    .update({
      status: "rejected",
      rejection_reason: reason,
      founder_approved_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("approval_id", approvalId)
    .eq("status", "pending");

  if (error) {
    console.error("[autonomy/db] rejectApproval", error.message);
    return false;
  }

  return true;
}

/**
 * Record an execution result (audit trail).
 */
export async function recordExecutionResult(
  userId: string,
  companyId: string | null,
  result: ExecutionResult,
): Promise<ExecutionResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("execution_results")
    .insert({
      user_id: userId,
      company_id: companyId,
      execution_id: result.execution_id,
      agent: result.agent,
      domain: result.domain,
      action: result.action,
      status: result.status,
      required_approval: result.required_approval,
      approval_id: result.approval_id,
      founder_approved_at: result.founder_approved_at,
      completed_at: result.completed_at,
      result_data: result.result_data,
      error: result.error,
      created_at: result.created_at,
      expires_at: result.expires_at,
      emitted_to: result.emitted_to,
    })
    .select()
    .single();

  if (error) {
    console.error("[autonomy/db] recordExecutionResult", error.message);
    return null;
  }

  return (data as ExecutionResult) ?? null;
}

/**
 * List execution results for audit/visibility (last 100, most recent first).
 */
export async function listExecutionResults(
  userId: string,
  companyId: string | null,
): Promise<ExecutionResult[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("execution_results")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[autonomy/db] listExecutionResults", error.message);
    return [];
  }

  return (data as ExecutionResult[]) ?? [];
}
