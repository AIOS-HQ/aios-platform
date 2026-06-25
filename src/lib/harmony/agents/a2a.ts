import "server-only";

import { createClient } from "@/lib/supabase/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { juliusRecall, juliusRemember } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";

/**
 * Agent-to-Agent (A2A) communication — the AIOS workforce collaboration layer.
 *
 * Agents send messages, delegate tasks, and respond with outcomes. Every send
 * pulls shared context from Julius (the AIOS-only org brain) and every response
 * writes the outcome back to Julius, so the workforce stays mutually aware.
 * Risky/write delegations are gated through the existing Approval Center
 * (approvals.agent_message_id) — the founder stays in the loop. Every action is
 * emitted to the activity feed so the Auditor and Command Center can see it.
 *
 * Company-scoped + owner-private (RLS). AIOS and AirBid never mix.
 * Degrades gracefully until the agent_messages migration is applied.
 */

export type AgentMessageKind = "message" | "task" | "response";
export type AgentMessageStatus =
  | "open"
  | "delegated"
  | "in_progress"
  | "completed"
  | "blocked"
  | "awaiting_approval";
export type AgentMessageRisk = "routine" | "approval" | "destructive";

export interface AgentMessage {
  id: string;
  user_id: string;
  company_id: string;
  from_agent: string;
  to_agent: string;
  kind: AgentMessageKind;
  status: AgentMessageStatus;
  risk: AgentMessageRisk;
  parent_id: string | null;
  subject: string;
  body: string;
  context: Record<string, unknown>;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

const RISK_TO_PRIORITY: Record<AgentMessageRisk, "low" | "medium" | "high"> = {
  routine: "low",
  approval: "medium",
  destructive: "high",
};

function riskRequiresApproval(risk: AgentMessageRisk): boolean {
  return risk === "approval" || risk === "destructive";
}

function agentName(key: string): string {
  return getAiosAgent(key)?.name ?? key;
}

/**
 * Send a message or delegate a task from one AIOS agent to another. Attaches
 * Julius context and routes risky/write actions to the Approval Center.
 */
export async function sendAgentMessage(params: {
  userId: string;
  companyId: string;
  fromAgent: string;
  toAgent: string;
  subject: string;
  body?: string;
  kind?: AgentMessageKind;
  risk?: AgentMessageRisk;
  parentId?: string | null;
  /** Attach shared Julius context at send time (default true). */
  attachJuliusContext?: boolean;
}): Promise<AgentMessage | null> {
  const subject = params.subject.trim();
  if (!subject) return null;
  if (!getAiosAgent(params.fromAgent) || !getAiosAgent(params.toAgent)) {
    console.error(
      "[a2a] unknown AIOS agent key(s)",
      params.fromAgent,
      params.toAgent,
    );
    return null;
  }

  const supabase = await createClient();
  const kind: AgentMessageKind = params.kind ?? "message";
  const risk: AgentMessageRisk = params.risk ?? "routine";

  // Agent READ: shared org context before acting.
  let context: Record<string, unknown> = {};
  if (params.attachJuliusContext !== false) {
    const entries = await juliusRecall(params.userId, params.companyId, subject, 5);
    context = {
      query: subject,
      julius: entries.map((e) => ({ id: e.id, title: e.title, kind: e.kind })),
    };
  }

  const gated = riskRequiresApproval(risk);
  const status: AgentMessageStatus = gated
    ? "awaiting_approval"
    : kind === "task"
      ? "delegated"
      : "open";

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      from_agent: params.fromAgent,
      to_agent: params.toAgent,
      kind,
      status,
      risk,
      parent_id: params.parentId ?? null,
      subject: subject.slice(0, 300),
      body: (params.body ?? "").slice(0, 8000),
      context,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[a2a] sendAgentMessage", error.message);
    return null;
  }
  const message = data as AgentMessage | null;
  if (!message) return null;

  // Governance: risky/write delegations wait for founder approval.
  if (gated) {
    await supabase.from("approvals").insert({
      user_id: params.userId,
      company_id: params.companyId,
      agent_message_id: message.id,
      type: "content",
      title: `${agentName(params.fromAgent)} → ${agentName(params.toAgent)}: ${subject}`.slice(0, 200),
      summary: (params.body ?? subject).slice(0, 500),
      risk: RISK_TO_PRIORITY[risk],
    });
  }

  await emitActivity({
    userId: params.userId,
    companyId: params.companyId,
    actorType: "agent",
    kind: gated ? "approval" : "agent_action",
    summary: gated
      ? `${agentName(params.fromAgent)} requested approval to delegate to ${agentName(params.toAgent)}: ${subject}`
      : `${agentName(params.fromAgent)} → ${agentName(params.toAgent)}: ${subject}`,
    refType: "agent_message",
    refId: message.id,
  });

  return message;
}

/** Delegate a task to another agent (a `task`-kind message). */
export async function delegateTask(params: {
  userId: string;
  companyId: string;
  fromAgent: string;
  toAgent: string;
  subject: string;
  body?: string;
  risk?: AgentMessageRisk;
}): Promise<AgentMessage | null> {
  return sendAgentMessage({ ...params, kind: "task" });
}

/**
 * Respond to a delegated task: thread a response back to the requester, close
 * the parent with its outcome, and persist the outcome to Julius.
 */
export async function respondToTask(params: {
  userId: string;
  companyId: string;
  parentId: string;
  fromAgent: string;
  outcome: string;
  status?: "completed" | "blocked";
}): Promise<AgentMessage | null> {
  const outcome = params.outcome.trim();
  if (!outcome) return null;

  const supabase = await createClient();
  const { data: parentData } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("id", params.parentId)
    .eq("user_id", params.userId)
    .maybeSingle();
  const parent = parentData as AgentMessage | null;
  if (!parent) return null;

  const finalStatus = params.status ?? "completed";

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      from_agent: params.fromAgent,
      to_agent: parent.from_agent,
      kind: "response",
      status: finalStatus,
      risk: "routine",
      parent_id: parent.id,
      subject: `Re: ${parent.subject}`.slice(0, 300),
      body: outcome.slice(0, 8000),
      outcome: outcome.slice(0, 8000),
    })
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[a2a] respondToTask", error.message);
    return null;
  }

  await supabase
    .from("agent_messages")
    .update({ status: finalStatus, outcome: outcome.slice(0, 8000) })
    .eq("id", parent.id)
    .eq("user_id", params.userId);

  // Agent WRITE: persist the outcome to the org brain.
  await juliusRemember({
    userId: params.userId,
    companyId: params.companyId,
    agent: params.fromAgent,
    kind: "activity",
    title: `Agent outcome: ${parent.subject}`.slice(0, 300),
    content: outcome,
    refs: { agentMessageId: parent.id, kind: "a2a_response" },
  });

  // Shared intelligence: capture the lesson so the workforce and Harmony learn
  // from outcomes over time. Completions record reusable success patterns; blocks
  // record failures/blockers. Both land in the org brain Harmony reads from, so
  // Harmony continuously improves from the workforce's experience.
  await juliusRemember({
    userId: params.userId,
    companyId: params.companyId,
    agent: params.fromAgent,
    kind: "knowledge",
    title: `${finalStatus === "completed" ? "Pattern" : "Blocker"} — ${parent.subject}`.slice(0, 300),
    content:
      finalStatus === "completed"
        ? `Successful approach by ${agentName(params.fromAgent)} for "${parent.subject}": ${outcome}`
        : `${agentName(params.fromAgent)} was blocked on "${parent.subject}". Reason: ${outcome}`,
    refs: {
      agentMessageId: parent.id,
      kind: finalStatus === "completed" ? "lesson_success" : "lesson_blocked",
    },
    importance: finalStatus === "completed" ? 3 : 4,
  });

  await emitActivity({
    userId: params.userId,
    companyId: params.companyId,
    actorType: "agent",
    kind: finalStatus === "blocked" ? "system" : "agent_action",
    summary: `${agentName(params.fromAgent)} ${
      finalStatus === "blocked" ? "blocked" : "completed"
    }: ${parent.subject}`,
    refType: "agent_message",
    refId: parent.id,
  });

  // Event-driven executive reflection: a delegation outcome is a meaningful
  // execution event. Best-effort and fail-open (never blocks the response);
  // lazily imported to avoid an import cycle (the reflection engine reads
  // agent_messages).
  try {
    const { reflectAfterEvent } = await import("@/lib/harmony/reflection");
    await reflectAfterEvent(
      params.userId,
      params.companyId,
      finalStatus === "completed" ? "delegation_completed" : "delegation_blocked",
    );
  } catch (e) {
    console.error("[a2a] reflectAfterEvent", e);
  }

  return data as AgentMessage | null;
}

export async function listAgentMessages(
  userId: string,
  companyId: string,
  opts?: { limit?: number; agent?: string; status?: AgentMessageStatus },
): Promise<AgentMessage[]> {
  const supabase = await createClient();
  let q = supabase
    .from("agent_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("company_id", companyId);
  if (opts?.agent) q = q.or(`from_agent.eq.${opts.agent},to_agent.eq.${opts.agent}`);
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 50);

  const { data, error } = await q;
  if (error) {
    console.error("[a2a] listAgentMessages", error.message);
    return [];
  }
  return (data as AgentMessage[] | null) ?? [];
}

/** Count in-flight agent work (open/delegated/in-progress/awaiting approval). */
export async function countOpenAgentWork(
  userId: string,
  companyId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .in("status", ["open", "delegated", "in_progress", "awaiting_approval"]);
  if (error) {
    console.error("[a2a] countOpenAgentWork", error.message);
    return 0;
  }
  return count ?? 0;
}
