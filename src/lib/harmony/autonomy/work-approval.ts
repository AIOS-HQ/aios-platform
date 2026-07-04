/**
 * Unified Autonomy Policy Engine — Work-item approval bridge (pure).
 *
 * Maps a Harmony work item to an engine ApprovalPayload so a gated work item can
 * be represented in the single approval spine (approval_payloads) and resumed by
 * execution-resumption. The real work item id + title are carried in
 * original_params so the Review Queue can display it and resumption can re-run
 * executeWorkItem with force=true.
 *
 * Pure (types only): no I/O, unit-testable.
 */

import type { ApprovalPayload } from "./types";

export interface WorkItemApprovalInput {
  id: string;
  title: string;
  companyId?: string | null;
}

/**
 * Build an approval payload for a gated work item. Generic work is attributed to
 * the Harmony coordinator in the operations domain; the payload's existence — not
 * its action label — is what marks it as awaiting approval.
 */
export function buildWorkItemApprovalPayload(
  item: WorkItemApprovalInput,
  now: Date = new Date(),
): ApprovalPayload {
  const suffix = Math.random().toString(36).slice(2, 9);
  return {
    approval_id: `approval_wi_${now.getTime()}_${suffix}`,
    original_actor: "harmony",
    original_agent: "harmony",
    original_domain: "operations",
    original_action: "coordinate_agents",
    original_params: { workItemId: item.id, workItemTitle: item.title },
    required_context: {},
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
  };
}
