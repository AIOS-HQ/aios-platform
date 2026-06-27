"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import {
  appendSkillContext,
  consultCompanySkills,
  recordSkillConsultation,
} from "@/lib/company-skills/utilization";
import {
  appendOrganizationalContext,
  buildOrganizationalIntelligence,
} from "@/lib/organizational-intelligence/engine";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import type { ActionState } from "@/lib/types";
import type { TaskPriority, WorkStatus } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

function priority(v: FormDataEntryValue | null): TaskPriority {
  const s = String(v ?? "medium") as TaskPriority;
  return PRIORITIES.includes(s) ? s : "medium";
}

function status(v: FormDataEntryValue | null): WorkStatus {
  const s = String(v ?? "pending") as WorkStatus;
  return WORK_STATUSES.includes(s) ? s : "pending";
}

function revalidateWork(id?: string) {
  revalidatePath("/harmony");
  revalidatePath("/harmony/work");
  revalidatePath("/harmony/departments/[id]", "page");
  if (id) revalidatePath(`/harmony/work/${id}`);
}

export async function createWorkItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const companyId = String(formData.get("company_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = orNull(formData.get("description"));
  if (!companyId) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const consultation = await consultCompanySkills({
    userId: user.id,
    companyId,
    agent: "harmony",
    purpose: "work_item_generation",
    query: `${title}\n${description ?? ""}`,
    emit: false,
  });
  const organization = await buildOrganizationalIntelligence(user.id, companyId, {
    limit: 300,
  });
  const plannedDescription = appendOrganizationalContext(
    appendSkillContext(description, consultation),
    organization,
  );
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      user_id: user.id,
      company_id: companyId,
      department_id: refOrNull(formData.get("department_id")),
      project_id: refOrNull(formData.get("project_id")),
      agent_id: refOrNull(formData.get("agent_id")),
      title,
      description: plannedDescription,
      priority: priority(formData.get("priority")),
      status: status(formData.get("status")),
      due_date: orNull(formData.get("due_date")),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[work-actions] createWorkItem", error);
    return { status: "error", message: t("errors.generic") };
  }

  await emitActivity({
    userId: user.id,
    companyId,
    departmentId: refOrNull(formData.get("department_id")),
    kind: "system",
    summary: to("activity.workCreated", { title }),
    refType: "work_item",
    refId: (data as { id: string }).id,
  });
  if (consultation.skills.length > 0) {
    await recordSkillConsultation({
      userId: user.id,
      companyId,
      agent: "harmony",
      consultation,
      sourceType: "work_item",
      sourceId: (data as { id: string }).id,
    });
  }

  revalidateWork();
  return { status: "success", message: t("saved") };
}

export async function updateWorkItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = orNull(formData.get("description"));
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_items")
    .update({
      title,
      description,
      department_id: refOrNull(formData.get("department_id")),
      project_id: refOrNull(formData.get("project_id")),
      agent_id: refOrNull(formData.get("agent_id")),
      priority: priority(formData.get("priority")),
      status: status(formData.get("status")),
      due_date: orNull(formData.get("due_date")),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[work-actions] updateWorkItem", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateWork(id);
  return { status: "success", message: t("saved") };
}

/** Quick status move within the work queue. */
export async function setWorkStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const next = status(formData.get("status"));
  if (!id) return;
  const supabase = await createClient();
  const { data: workItem } = await supabase
  .from("work_items")
  .update({ status: next })
  .eq("id", id)
  .eq("user_id", user.id)
  .select("id, objective_id")
  .single();

if (workItem?.objective_id) {
  const { count: total } = await supabase
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("objective_id", workItem.objective_id)
    .eq("user_id", user.id);

  const { count: completed } = await supabase
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("objective_id", workItem.objective_id)
    .eq("user_id", user.id)
    .eq("status", "completed");

  const progress =
    total && total > 0 ? Math.round(((completed ?? 0) / total) * 100) : 0;

  await supabase
    .from("objectives")
    .update({
      progress,
      status: progress === 100 ? "completed" : "active",
    })
    .eq("id", workItem.objective_id)
    .eq("user_id", user.id);

  revalidatePath(`/harmony/objectives/${workItem.objective_id}`);
  revalidatePath("/harmony/objectives");
}

revalidateWork(id);
}
export async function deleteWorkItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("work_items").delete().eq("id", id).eq("user_id", user.id);
  revalidateWork();
}
