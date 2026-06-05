import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { getProvider } from "@/lib/ai/provider";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  clampAutonomy,
  requiresApproval,
  resolveAutonomy,
  type AutonomyLevel,
} from "@/lib/harmony/os/autonomy";
import { LIMITS } from "@/lib/limits";
import type { WorkItem } from "@/types/database";

export type ExecutionOutcome = "completed" | "awaiting_approval";

/**
 * Run a work item through its department's autonomy policy — the heart of the
 * Helper Execution System.
 *
 * - Below "Autonomous" (level < 3): the work is gated — moved to
 *   `awaiting_approval` with an Approval Center entry. (Unless `force`, e.g. the
 *   owner just approved it.)
 * - "Autonomous" / "Executive Autonomous": the helper executes via the active
 *   AI provider (real when an API key is configured, mock otherwise), records
 *   the result on the work item, and completes it.
 *
 * Every transition is written to the activity feed (audit log).
 */
export async function executeWorkItem(
  supabase: SupabaseClient,
  userId: string,
  item: WorkItem,
  opts?: { force?: boolean },
): Promise<ExecutionOutcome> {
  const to = await getTranslations("os");

  // Resolve effective autonomy: department level, overridden by the agent's.
  let level: AutonomyLevel = 0;
  let departmentName = "";
  if (item.department_id) {
    const { data } = await supabase
      .from("departments")
      .select("name, autonomy_level")
      .eq("id", item.department_id)
      .maybeSingle();
    const dept = data as { name: string; autonomy_level: number } | null;
    if (dept) {
      level = clampAutonomy(dept.autonomy_level ?? 0);
      departmentName = dept.name ?? "";
    }
  }
  if (item.agent_id) {
    const { data } = await supabase
      .from("agents")
      .select("autonomy_level")
      .eq("id", item.agent_id)
      .maybeSingle();
    const agent = data as { autonomy_level: number | null } | null;
    if (agent && agent.autonomy_level != null) {
      level = resolveAutonomy(level, clampAutonomy(agent.autonomy_level));
    }
  }

  // Gate below Autonomous.
  if (!opts?.force && requiresApproval(level)) {
    await supabase
      .from("work_items")
      .update({ status: "awaiting_approval" })
      .eq("id", item.id)
      .eq("user_id", userId);
    await supabase.from("approvals").insert({
      user_id: userId,
      company_id: item.company_id,
      department_id: item.department_id,
      agent_id: item.agent_id,
      work_item_id: item.id,
      type: "content",
      title: item.title,
      summary: item.description,
      risk: item.priority,
    });
    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "approval",
      summary: to("activity.workRouted", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });
    return "awaiting_approval";
  }

  // Execute via the active provider (real AI when configured; mock otherwise).
  await supabase
    .from("work_items")
    .update({ status: "in_progress" })
    .eq("id", item.id)
    .eq("user_id", userId);

  let result: string;
  try {
    const system = to("execution.system", { department: departmentName || "Harmony" });
    const prompt = `${item.title}\n\n${item.description ?? ""}`.trim();
    result = await getProvider().generate(prompt, system);
  } catch (err) {
    console.error("[execution] provider.generate failed", err);
    result = to("execution.failed");
    // Provider health monitoring: surface failures in the audit feed.
    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "system",
      summary: to("activity.providerError", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });
  }

  const note = `\n\n${to("execution.resultLabel")}\n${result}`;
  const description = `${item.description ?? ""}${note}`.slice(0, LIMITS.noteContent);
  await supabase
    .from("work_items")
    .update({ status: "completed", description })
    .eq("id", item.id)
    .eq("user_id", userId);
  await emitActivity({
    userId,
    companyId: item.company_id,
    departmentId: item.department_id,
    actorType: "agent",
    actorId: item.agent_id,
    kind: "agent_action",
    summary: to("activity.workCompleted", { title: item.title }),
    refType: "work_item",
    refId: item.id,
  });
  return "completed";
}
