import "server-only";

import { createClient } from "@/lib/supabase/server";
import { recordOpsEvent } from "@/lib/observability/ops";
import type { ActivityActor, ActivityKind } from "@/types/database";

/**
 * Append an event to the unified activity feed. Best-effort for the originating
 * action (the feed is observability, not source of truth), but NOT silent: a
 * dropped audit write is itself recorded to the ops_events channel so the gap is
 * visible in the Command Center. Owner-scoped via RLS.
 */
export async function emitActivity(input: {
  userId: string;
  kind: ActivityKind;
  summary: string;
  companyId?: string | null;
  departmentId?: string | null;
  actorType?: ActivityActor;
  actorId?: string | null;
  refType?: string | null;
  refId?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("activity_events").insert({
    user_id: input.userId,
    company_id: input.companyId ?? null,
    department_id: input.departmentId ?? null,
    actor_type: input.actorType ?? "founder",
    actor_id: input.actorId ?? null,
    kind: input.kind,
    summary: input.summary,
    ref_type: input.refType ?? null,
    ref_id: input.refId ?? null,
  });
  if (error) {
    console.error("[os/events] emitActivity", error);
    // Non-silent: surface the dropped audit write on the operational channel.
    await recordOpsEvent({
      userId: input.userId,
      companyId: input.companyId ?? null,
      level: "error",
      source: "activity",
      message: `Activity write failed: ${input.summary}`,
      context: {
        kind: input.kind,
        refType: input.refType ?? null,
        error: error.message,
      },
    });
  }
}
