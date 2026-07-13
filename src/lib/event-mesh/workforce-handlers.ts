import "server-only";

import { createClient } from "@/lib/supabase/server";
import { emitActivity } from "@/lib/harmony/os/events";
import { respondToTask, type AgentMessage } from "@/lib/harmony/agents/a2a";
import { resumeApprovedExecution } from "@/lib/harmony/autonomy/execution-resumption";
import { certifyWorkforceAgent } from "@/lib/workforce/certification";
import { getAiosAgent, isFounderOnlyAgent } from "@/lib/workforce/registry";
import type { EventDelivery, EventMeshConsumer } from "@/lib/event-mesh/types";
import type { AiosAgent } from "@/lib/workforce/registry";

async function loadAgentMessage(userId: string, messageId: string): Promise<AgentMessage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) {
    console.error("[event-mesh/workforce] load message", error.message);
    return null;
  }
  return (data as AgentMessage | null) ?? null;
}

async function markMessageStatus(userId: string, messageId: string, status: AgentMessage["status"], outcome?: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .update({ status, ...(outcome ? { outcome: outcome.slice(0, 8000) } : {}) })
    .eq("user_id", userId)
    .eq("id", messageId)
    .in("status", ["delegated", "in_progress"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[event-mesh/workforce] mark message", error.message);
    return false;
  }
  return Boolean(data);
}

function eventMeshExecutionEnabled(): boolean {
  return process.env.AIOS_EVENT_MESH_WORKFORCE_EXECUTION === "true";
}

function hasRegisteredRuntime(agent: AiosAgent): boolean {
  return getAiosAgent(agent.key) !== null;
}

export async function handleWorkforceTaskCreated(delivery: EventDelivery): Promise<void> {
  const { event } = delivery;
  const userId = event.userId;
  const messageId = event.taskRef?.type === "agent_message" ? event.taskRef.id : null;
  if (!userId || !event.companyId || !messageId) {
    await delivery.deadLetter("workforce_task_missing_reference");
    return;
  }

  const message = await loadAgentMessage(userId, messageId);
  if (!message) {
    await delivery.deadLetter("agent_message_not_found");
    return;
  }
  if (message.company_id !== event.companyId) {
    await delivery.deadLetter("company_scope_mismatch");
    return;
  }
  if (message.status === "awaiting_approval") {
    await delivery.acknowledge();
    return;
  }
  if (message.status === "completed" || message.status === "blocked") {
    await delivery.acknowledge();
    return;
  }

  const target = getAiosAgent(message.to_agent);
  if (!target) {
    await markMessageStatus(userId, messageId, "blocked", "Unknown target agent rejected by Event Mesh.");
    await delivery.acknowledge();
    return;
  }

  const certification = await certifyWorkforceAgent(target, { userId });
  const hardBlocker = certification.dependencyReadiness.some((dep) => dep.required && dep.blockers.length > 0);
  if (hardBlocker || certification.status === "blocked" || !hasRegisteredRuntime(target)) {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: target.key,
      status: "blocked",
      outcome: `Event Mesh blocked ${target.name}: ${certification.blockers[0] ?? "runtime is not ready."}`,
    });
    await delivery.acknowledge();
    return;
  }

  if (isFounderOnlyAgent(target.key) && event.actor.type !== "founder") {
    await respondToTask({
      userId,
      companyId: event.companyId,
      parentId: message.id,
      fromAgent: target.key,
      status: "blocked",
      outcome: "Founder-only agent work cannot run from a non-Founder event.",
    });
    await delivery.acknowledge();
    return;
  }

  if (!eventMeshExecutionEnabled()) {
    const claimed = await markMessageStatus(userId, messageId, "in_progress");
    if (claimed) {
      await emitActivity({
        userId,
        companyId: event.companyId,
        actorType: "agent",
        kind: "agent_action",
        summary: `Event Mesh delivered ${message.subject} to ${target.name}; asynchronous execution is in shadow mode.`,
        refType: "agent_message",
        refId: message.id,
      });
    }
    await delivery.acknowledge();
    return;
  }

  await respondToTask({
    userId,
    companyId: event.companyId,
    parentId: message.id,
    fromAgent: target.key,
    status: "blocked",
    outcome: "Event Mesh delivered the task, but no autonomous specialist handler is enabled for this task type.",
  });
  await delivery.acknowledge();
}

export async function handleApprovalResolved(delivery: EventDelivery): Promise<void> {
  const { event } = delivery;
  if (!event.userId || !event.approvalId) {
    await delivery.deadLetter("approval_event_missing_reference");
    return;
  }
  if (event.payload.status === "rejected" || event.payload.resumed === true) {
    await delivery.acknowledge();
    return;
  }
  const outcome = await resumeApprovedExecution(event.userId, event.approvalId, event.companyId);
  if (!outcome.ok) {
    await delivery.negativeAcknowledge(outcome.error ?? "approval_resume_failed", { retry: true, delayMs: 5000 });
    return;
  }
  await delivery.acknowledge();
}

export function createWorkforceEventConsumer(): EventMeshConsumer {
  return {
    consumerName: process.env.AIOS_EVENT_MESH_WORKFORCE_CONSUMER ?? "aios-workforce-dispatcher",
    eventTypes: ["workforce.task.created", "approval.resolved"],
    concurrency: Number(process.env.AIOS_EVENT_MESH_WORKFORCE_CONCURRENCY ?? 2),
    retryPolicy: { maximumAttempts: 5, initialDelayMs: 1000, backoffMultiplier: 2, maximumDelayMs: 30000 },
    handler: async (delivery) => {
      if (delivery.event.eventType === "workforce.task.created") return handleWorkforceTaskCreated(delivery);
      if (delivery.event.eventType === "approval.resolved") return handleApprovalResolved(delivery);
      await delivery.acknowledge();
    },
  };
}
