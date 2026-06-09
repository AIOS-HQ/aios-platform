import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getTool } from "@/lib/agent/tools/registry";
import type {
  AgentActionRecord,
  AgentActionStatus,
  ToolDefinition,
  ToolResult,
} from "@/lib/agent/tools/types";

/**
 * Harmony tool-execution engine (server-only).
 *
 * Every execution is recorded in `agent_actions` (owner-scoped via RLS) so there
 * is a complete audit trail and a human-in-the-loop gate: tools that declare
 * `requiresApproval` are held as 'pending' until the owner approves them. There
 * is no cross-user path — callers pass the authenticated user's id and RLS does
 * the rest. If the audit table is missing (migration not applied), benign
 * no-approval tools still run (unaudited, logged), while approval-gated tools
 * are refused rather than run without a record.
 */

export interface ExecuteResult {
  ok: boolean;
  status: AgentActionStatus;
  actionId: string | null;
  /** Tool output when it ran. */
  data?: Record<string, unknown>;
  /** Machine-readable reason on failure. */
  error?: string;
}

export interface ExecuteOptions {
  /** Label for who requested this (e.g. 'harmony','manual','workflow'). */
  source?: string;
  /** Skip the approval hold even for tools that normally require it (owner intent). */
  autoApprove?: boolean;
}

async function runTool(
  userId: string,
  tool: ToolDefinition | null,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  if (!tool) return { ok: false, message: "unknown_tool" };
  try {
    return await tool.run({ userId }, params);
  } catch (e) {
    console.error("[agent] tool threw", tool.name, e);
    return { ok: false, message: "tool_error" };
  }
}

/**
 * Execute a tool by name. Records the attempt, honours the approval gate, runs
 * the tool when allowed, and captures the result/error.
 */
export async function executeTool(
  userId: string,
  toolName: string,
  params: Record<string, unknown> = {},
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const tool = getTool(toolName);
  const supabase = await createClient();
  const requiresApproval = Boolean(tool?.requiresApproval) && !options.autoApprove;
  const initialStatus: AgentActionStatus = !tool
    ? "failed"
    : requiresApproval
      ? "pending"
      : "approved";

  const { data: row, error: insertError } = await supabase
    .from("agent_actions")
    .insert({
      user_id: userId,
      tool: toolName,
      params,
      status: initialStatus,
      requires_approval: Boolean(tool?.requiresApproval),
      source: options.source ?? "harmony",
      error: tool ? null : "unknown_tool",
    })
    .select("*")
    .maybeSingle();

  if (insertError) {
    console.error("[agent] executeTool insert", insertError.message);
    // Audit unavailable: never run an approval-gated tool without a record.
    if (!tool) return { ok: false, status: "failed", actionId: null, error: "unknown_tool" };
    if (requiresApproval) {
      return { ok: false, status: "failed", actionId: null, error: "audit_unavailable" };
    }
    const result = await runTool(userId, tool, params);
    return {
      ok: result.ok,
      status: result.ok ? "executed" : "failed",
      actionId: null,
      data: result.data,
      error: result.ok ? undefined : result.message,
    };
  }

  const action = row as AgentActionRecord | null;
  const actionId = action?.id ?? null;

  if (!tool) return { ok: false, status: "failed", actionId, error: "unknown_tool" };
  if (requiresApproval) return { ok: true, status: "pending", actionId };

  return finishAction(userId, actionId, tool.name, params);
}

/** Run a tool for an existing (approved) action row and persist the outcome. */
async function finishAction(
  userId: string,
  actionId: string | null,
  toolName: string,
  params: Record<string, unknown>,
): Promise<ExecuteResult> {
  const tool = getTool(toolName);
  const result = await runTool(userId, tool, params);
  const status: AgentActionStatus = result.ok ? "executed" : "failed";

  if (actionId) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("agent_actions")
      .update({
        status,
        result: result.ok ? (result.data ?? {}) : null,
        error: result.ok ? null : (result.message ?? "tool_error"),
        executed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", actionId);
    if (error) console.error("[agent] finishAction update", error.message);
  }

  return {
    ok: result.ok,
    status,
    actionId,
    data: result.data,
    error: result.ok ? undefined : result.message,
  };
}

export interface ListActionsOptions {
  status?: AgentActionStatus;
  limit?: number;
}

export async function listAgentActions(
  userId: string,
  options: ListActionsOptions = {},
): Promise<AgentActionRecord[]> {
  const supabase = await createClient();
  let q = supabase.from("agent_actions").select("*").eq("user_id", userId);
  if (options.status) q = q.eq("status", options.status);
  q = q.order("created_at", { ascending: false }).limit(options.limit ?? 100);

  const { data, error } = await q;
  if (error) {
    console.error("[agent] listAgentActions", error.message);
    return [];
  }
  return (data as AgentActionRecord[] | null) ?? [];
}

/** Approve a pending action and execute its tool. Owner-scoped. */
export async function approveAgentAction(
  userId: string,
  id: string,
): Promise<ExecuteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[agent] approve load", error.message);
    return { ok: false, status: "failed", actionId: id, error: "not_found" };
  }

  const action = data as AgentActionRecord;
  if (action.status !== "pending") {
    return { ok: false, status: action.status, actionId: id, error: "not_pending" };
  }

  await supabase
    .from("agent_actions")
    .update({ status: "approved" })
    .eq("user_id", userId)
    .eq("id", id);

  return finishAction(userId, id, action.tool, action.params ?? {});
}

/** Reject a pending action without running it. Owner-scoped. */
export async function rejectAgentAction(userId: string, id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_actions")
    .update({ status: "rejected" })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    console.error("[agent] rejectAgentAction", error.message);
    return false;
  }
  return true;
}
