import "server-only";

import { getEventMesh } from "@/lib/event-mesh/config";
import { createAiosEventEnvelope } from "@/lib/event-mesh/envelope";
import type { AiosEventEnvelope, AiosEventType, PublishResult } from "@/lib/event-mesh/types";

export async function publishAiosEvent(input: Parameters<typeof createAiosEventEnvelope>[0]): Promise<PublishResult> {
  const event = createAiosEventEnvelope(input);
  return getEventMesh().publish(event);
}

export async function publishAiosEventBestEffort(input: Parameters<typeof createAiosEventEnvelope>[0]): Promise<void> {
  try {
    const enabled = process.env.AIOS_EVENT_MESH_OUTBOX_ENABLED ?? "true";
    if (enabled === "false") return;
    const result = await publishAiosEvent(input);
    if (!result.ok) {
      console.warn("[event-mesh] publish failed", {
        eventType: input.eventType,
        ref: input.taskRef,
        error: result.error,
      });
    }
  } catch (error) {
    console.warn("[event-mesh] publish exception", {
      eventType: input.eventType,
      ref: input.taskRef,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

export function eventForReference(input: {
  eventType: AiosEventType;
  userId: string | null;
  companyId: string | null;
  sourceAgent?: string | null;
  targetAgent?: string | null;
  risk?: AiosEventEnvelope["risk"];
  priority?: AiosEventEnvelope["priority"];
  taskRef: NonNullable<AiosEventEnvelope["taskRef"]>;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  approvalId?: string | null;
}): Parameters<typeof createAiosEventEnvelope>[0] {
  return {
    eventType: input.eventType,
    userId: input.userId,
    companyId: input.companyId,
    sourceAgent: input.sourceAgent ?? null,
    targetAgent: input.targetAgent ?? null,
    risk: input.risk ?? "routine",
    priority: input.priority ?? "normal",
    taskRef: input.taskRef,
    payload: input.payload ?? {},
    context: input.context ?? {},
    approvalId: input.approvalId ?? null,
  };
}
