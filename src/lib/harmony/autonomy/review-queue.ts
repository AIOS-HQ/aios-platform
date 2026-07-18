/**
 * Unified Autonomy Policy Engine — Review Queue accessor.
 *
 * Shapes the engine's pending approval_payloads for the Founder Review Queue.
 * Thin, dependency-injected wrapper over data-access.listPendingApprovals so
 * the page stays a simple server component and the shaping is unit-testable
 * without a database.
 */

import "server-only";

import type { ActionType, ApprovalPayload } from "./types";
import { isDestructive } from "./risk-mapping";

export interface PendingApprovalItem {
  approvalId: string;
  actor: string;
  agent: string;
  domain: string;
  action: string;
  /** Human label: connector capability (`github.create_issue`) or the action. */
  label: string;
  destructive: boolean;
  createdAt: string;
  expiresAt: string;
}

export async function listPendingApprovalsForReview(
  userId: string,
  companyId: string | null,
): Promise<Array<{
  approvalId: string;
  agent: string;
  agentName: string;
  label: string;
  destructive: boolean;
  action: string;
  domain: string;
  actor: string;
  createdAt: string;
  expiresAt: string;
}>> {
  const rows = await getPendingApprovalQueue(userId, companyId);
  return rows.map((row) => ({
    approvalId: row.approvalId,
    agent: row.agent,
    agentName: row.agent,
    label: row.label,
    destructive: row.destructive,
    action: row.action,
    domain: row.domain,
    actor: row.actor,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }));
}

export interface ReviewQueueDeps {
  listPendingApprovals: (userId: string, companyId: string | null) => Promise<ApprovalPayload[]>;
}

function defaultDeps(): ReviewQueueDeps {
  return {
    listPendingApprovals: async (userId, companyId) =>
      (await import("./data-access")).listPendingApprovals(userId, companyId),
  };
}

function labelFor(payload: ApprovalPayload): string {
  const params = (payload.original_params ?? {}) as Record<string, unknown>;
  if (typeof params.connectorId === "string" && typeof params.capabilityId === "string") {
    return `${params.connectorId}.${params.capabilityId}`;
  }
  if (typeof params.workItemTitle === "string" && params.workItemTitle.length > 0) {
    return params.workItemTitle;
  }
  return payload.original_action;
}

/**
 * Return the Founder's pending approvals, shaped for the Review Queue.
 * Destructive actions are flagged so the UI can surface a HIGH-RISK badge.
 */
export async function getPendingApprovalQueue(
  userId: string,
  companyId: string | null,
  deps: Partial<ReviewQueueDeps> = {},
): Promise<PendingApprovalItem[]> {
  const d: ReviewQueueDeps = { ...defaultDeps(), ...deps };
  const payloads = await d.listPendingApprovals(userId, companyId);

  return payloads.map((p) => ({
    approvalId: p.approval_id,
    actor: p.original_actor,
    agent: p.original_agent,
    domain: p.original_domain,
    action: p.original_action,
    label: labelFor(p),
    destructive: isDestructive(p.original_action as ActionType),
    createdAt: p.created_at,
    expiresAt: p.expires_at,
  }));
}
