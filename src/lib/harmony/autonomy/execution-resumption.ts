/**
 * Unified Autonomy Policy Engine — Execution resumption.
 *
 * Handles the approval resumption flow: when a Founder approves a paused action,
 * this module validates the approval context and resumes execution.
 */

import "server-only";

import { getApprovalPayload } from "./data-access";
import type { ApprovalPayload, ExecutionResult } from "./types";

/**
 * Validate that the saved approval context is still valid (hasn't become stale).
 *
 * For example:
 *  - Branch still exists
 *  - Repository is still accessible
 *  - Files haven't been deleted
 *  - No conflicting changes
 *
 * For now, this is a stub that always returns true.
 * In production, this would make API calls to GitHub, Vercel, etc.
 */
async function validateApprovalContextStillValid(
  context: Record<string, unknown>,
): Promise<{ valid: boolean; reason: string }> {
  // TODO: Implement actual validation
  // - If branch: check if it exists in GitHub
  // - If files: check if they haven't been deleted
  // - If target_state: compare current state to saved state
  return {
    valid: true,
    reason: "Context validation not yet implemented; assuming valid",
  };
}

/**
 * Resume a paused execution after Founder approval.
 *
 * This is called from the approval action handler. It:
 *  1. Validates that the approval still exists and is approved
 *  2. Validates that the context is still valid (branch exists, etc.)
 *  3. Calls back into the original execution runtime with founderApproved=true
 *  4. Returns the execution result
 */
export async function resumeApprovedExecution(
  userId: string,
  approvalId: string,
): Promise<{
  ok: boolean;
  error?: string;
  execution_result?: ExecutionResult;
}> {
  // Get the approval payload
  const approval = await getApprovalPayload(userId, approvalId);
  if (!approval) {
    return {
      ok: false,
      error: `Approval ${approvalId} not found or not pending`,
    };
  }

  // Validate context is still valid
  const contextCheck = await validateApprovalContextStillValid(approval.required_context);
  if (!contextCheck.valid) {
    return {
      ok: false,
      error: `Approval context is stale: ${contextCheck.reason}`,
    };
  }

  // TODO: Call back into the original execution runtime
  // - If Mason: call masonProductionRuntime with founderApproved=true
  // - If Connector: call runConnectorCapability with approved=true
  // - If other agent: dispatch to appropriate handler

  // For now, return a placeholder
  return {
    ok: true,
    error: undefined,
    execution_result: {
      execution_id: `exec_${Date.now()}`,
      agent: approval.original_agent,
      domain: approval.original_domain,
      action: approval.original_action,
      status: "completed",
      required_approval: true,
      approval_id: approvalId,
      founder_approved_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      emitted_to: ["activity_feed", "review_queue"],
    },
  };
}
