/**
 * Harmony tool-execution types (AI Agent Stack: Function Calling, PR 2).
 * The agent_actions table (migration 20260605000000) is the audit backbone.
 */

export const AGENT_ACTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
  "cancelled",
] as const;

export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

export function isAgentActionStatus(
  value: string | null | undefined,
): value is AgentActionStatus {
  return (
    Boolean(value) &&
    (AGENT_ACTION_STATUSES as readonly string[]).includes(value as string)
  );
}

/** A row of the public.agent_actions audit table. */
export interface AgentActionRecord {
  id: string;
  user_id: string;
  tool: string;
  params: Record<string, unknown>;
  status: AgentActionStatus;
  requires_approval: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

/**
 * Context every tool runs with. Owner-scoped — a tool is only ever handed the
 * authenticated user's id, and all data access goes through RLS.
 */
export interface ToolContext {
  userId: string;
}

export interface ToolResult {
  ok: boolean;
  /** Serializable output stored on the action row (jsonb). */
  data?: Record<string, unknown>;
  /** Short machine-readable reason on failure. */
  message?: string;
}

export interface ToolDefinition {
  name: string;
  /** Human-readable description (also useful for assistant function specs later). */
  description: string;
  /** When true, an action is held as 'pending' until the owner approves it. */
  requiresApproval: boolean;
  run: (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;
}
