import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEventMesh } from "@/lib/event-mesh/config";
import type { DeadLetterRecord } from "@/lib/event-mesh/types";

export interface EventMeshOperationsSummary {
  provider: string;
  status: "healthy" | "degraded" | "unavailable";
  pending: number;
  retries: number;
  deadLetters: number;
  leased: number;
  oldestPendingAt: string | null;
  workerCount: number;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getEventMeshOperationsSummary(): Promise<EventMeshOperationsSummary> {
  const health = await getEventMesh().health();
  return {
    provider: health.provider,
    status: health.status,
    pending: numeric(health.details.pending),
    retries: numeric(health.details.retries),
    deadLetters: numeric(health.details.deadLetters),
    leased: numeric(health.details.leased),
    oldestPendingAt: typeof health.details.oldestPendingAt === "string" ? health.details.oldestPendingAt : null,
    workerCount: numeric(health.details.workerCount),
  };
}

export async function listEventMeshDeadLetters(limit = 50): Promise<DeadLetterRecord[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("event_mesh_dead_letters")
    .select("id,event_id,event_type,company_id,user_id,consumer_name,reason,attempts,safe_metadata,created_at,replayable")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[event-mesh/operations] list dead letters", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    eventId: String(row.event_id),
    eventType: row.event_type as DeadLetterRecord["eventType"],
    companyId: (row.company_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    consumerName: String(row.consumer_name),
    reason: String(row.reason),
    attempts: Number(row.attempts ?? 0),
    safeMetadata: (row.safe_metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
    replayable: row.replayable === true,
  }));
}

export async function replayEventMeshDeadLetter(eventId: string, consumerName?: string): Promise<boolean> {
  const result = await getEventMesh().replay(eventId, { consumerName, reason: "founder_admin_replay" });
  return result.ok;
}
