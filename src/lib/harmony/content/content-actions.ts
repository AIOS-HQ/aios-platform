"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { executeWorkItem } from "@/lib/harmony/os/execution";
import { getDepartmentTemplate } from "@/lib/harmony/os/catalog";
import { buildContentWorkItem } from "@/lib/harmony/content/generation";
import { isContentTaskKey } from "@/lib/harmony/content/catalog";
import type { ActionState } from "@/lib/types";
import type { WorkItem } from "@/types/database";

function revalidate() {
  revalidatePath("/harmony");
  revalidatePath("/harmony/content");
  revalidatePath("/harmony/work");
  revalidatePath("/harmony/activity");
  revalidatePath("/harmony/approvals");
}

/**
 * Harmony turns a content request into work: it picks the company's Content
 * department, routes to the owning helper, creates a work item, and runs it
 * through the Helper Execution System (auto-generate at Operator+/Executive, or
 * route to the Approval Center below that). The generated draft lands on the
 * work item and every step is written to the activity feed.
 */
export async function generateContent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const companyId = String(formData.get("company_id") ?? "");
  const taskKey = String(formData.get("task_key") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  if (!companyId || !isContentTaskKey(taskKey)) {
    return { status: "error", message: t("errors.generic") };
  }
  if (exceedsLimits([[topic, LIMITS.title]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();

  // Find the company's Content department (helpers live under it).
  const { data: deptRow } = await supabase
    .from("departments")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("key", "content")
    .maybeSingle();
  const departmentId = (deptRow as { id: string } | null)?.id ?? null;
  if (!departmentId) {
    return { status: "error", message: to("content.noDepartment") };
  }

  const built = buildContentWorkItem({
    taskKey,
    topic,
    label: to(`contentTask.${taskKey}.label`),
  });
  if (!built) return { status: "error", message: t("errors.generic") };

  // Route to the owning helper agent when the task has one.
  let agentId: string | null = null;
  if (built.helper) {
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id")
      .eq("user_id", user.id)
      .eq("department_id", departmentId)
      .eq("key", built.helper)
      .maybeSingle();
    agentId = (agentRow as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await supabase
    .from("work_items")
    .insert({
      user_id: user.id,
      company_id: companyId,
      department_id: departmentId,
      agent_id: agentId,
      title: built.title,
      description: built.description,
      status: "pending",
      priority: "medium",
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[content-actions] generateContent", error);
    return { status: "error", message: t("errors.generic") };
  }

  const item = data as WorkItem;
  await emitActivity({
    userId: user.id,
    companyId,
    departmentId,
    actorType: "founder",
    kind: "system",
    summary: to("activity.contentRequested", { title: built.title }),
    refType: "work_item",
    refId: item.id,
  });

  const outcome = await executeWorkItem(supabase, user.id, item);
  revalidate();
  return {
    status: "success",
    message:
      outcome === "completed" ? to("content.generated") : to("content.routed"),
    meta: { workItemId: item.id },
  };
}

/**
 * Backfill the Content department (+ its six helpers) into an existing company
 * that predates the Content Department. Idempotent: no-op if one already exists.
 */
export async function enableContentDepartment(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("departments")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("key", "content")
    .maybeSingle();
  if (existing) {
    revalidate();
    return;
  }

  const template = getDepartmentTemplate("content");
  if (!template) return;

  // Place it after the company's current departments.
  const { count } = await supabase
    .from("departments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("company_id", companyId);

  const { data: dept, error } = await supabase
    .from("departments")
    .insert({
      user_id: user.id,
      company_id: companyId,
      key: template.key,
      name: template.name,
      description: template.description,
      autonomy_level: template.defaultAutonomy,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !dept) {
    console.error("[content-actions] enableContentDepartment", error);
    return;
  }
  const departmentId = (dept as { id: string }).id;

  const agentRows = template.agents.map((a, i) => ({
    user_id: user.id,
    department_id: departmentId,
    key: a.key,
    name: a.name,
    role: a.role,
    position: i,
  }));
  const { error: agentErr } = await supabase.from("agents").insert(agentRows);
  if (agentErr) console.error("[content-actions] seed content agents", agentErr);

  const to = await getTranslations("os");
  await emitActivity({
    userId: user.id,
    companyId,
    departmentId,
    kind: "system",
    summary: to("activity.contentEnabled"),
    refType: "department",
    refId: departmentId,
  });

  revalidate();
}
