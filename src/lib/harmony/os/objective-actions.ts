"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import type { ActionState } from "@/lib/types";
import type { ObjectiveStatus } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}

const STATUSES: ObjectiveStatus[] = ["active", "paused", "completed", "archived"];

function revalidateObjectives(id?: string) {
  revalidatePath("/harmony");
  revalidatePath("/harmony/objectives");
  if (id) revalidatePath(`/harmony/objectives/${id}`);
}

export async function createObjective(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const companyId = String(formData.get("company_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const outcome = orNull(formData.get("outcome"));
  if (!companyId) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [outcome, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("objectives")
    .insert({
      user_id: user.id,
      company_id: companyId,
      department_id: refOrNull(formData.get("department_id")),
      title,
      outcome,
      due_date: orNull(formData.get("due_date")),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[objective-actions] createObjective", error);
    return { status: "error", message: t("errors.generic") };
  }

  await emitActivity({
    userId: user.id,
    companyId,
    kind: "objective",
    summary: to("activity.objectiveCreated", { title }),
    refType: "objective",
    refId: (data as { id: string }).id,
  });

  revalidateObjectives();
  return { status: "success", message: t("saved") };
}

export async function updateObjective(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const outcome = orNull(formData.get("outcome"));
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [outcome, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const status = String(formData.get("status") ?? "active") as ObjectiveStatus;
  const supabase = await createClient();
  const { error } = await supabase
    .from("objectives")
    .update({
      title,
      outcome,
      department_id: refOrNull(formData.get("department_id")),
      due_date: orNull(formData.get("due_date")),
      status: STATUSES.includes(status) ? status : "active",
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[objective-actions] updateObjective", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateObjectives(id);
  return { status: "success", message: t("saved") };
}

/** Inline progress update (0–100). */
export async function setObjectiveProgress(
  id: string,
  progress: number,
): Promise<void> {
  const user = await requireUser();
  if (!id) return;
  const value = Math.min(100, Math.max(0, Math.round(progress)));
  const supabase = await createClient();
  await supabase
    .from("objectives")
    .update({ progress: value })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateObjectives(id);
}

export async function deleteObjective(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("objectives").delete().eq("id", id).eq("user_id", user.id);
  revalidateObjectives();
}
