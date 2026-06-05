"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import type { ActionState } from "@/lib/types";
import type { GoalStatus } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function clampProgress(v: FormDataEntryValue | null): number {
  const n = Number.parseInt(String(v ?? "0"), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function revalidateGoals() {
  revalidatePath("/harmony");
  revalidatePath("/harmony/goals");
  revalidatePath("/harmony/goals/[id]", "page");
}

export async function createGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: t("errors.titleRequired") };

  const description = orNull(formData.get("description"));
  if (exceedsLimits([[title, LIMITS.title], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("personal_goals").insert({
    user_id: user.id,
    title,
    description,
    status: String(formData.get("status") ?? "active") as GoalStatus,
    progress: clampProgress(formData.get("progress")),
    target_date: orNull(formData.get("target_date")),
  });
  if (error) {
    console.error("[goal-actions] db error", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateGoals();
  return { status: "success", message: t("saved") };
}

export async function updateGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };

  const description = orNull(formData.get("description"));
  if (exceedsLimits([[title, LIMITS.title], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_goals")
    .update({
      title,
      description,
      status: String(formData.get("status") ?? "active") as GoalStatus,
      progress: clampProgress(formData.get("progress")),
      target_date: orNull(formData.get("target_date")),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[goal-actions] db error", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateGoals();
  return { status: "success", message: t("saved") };
}

export async function deleteGoal(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("personal_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateGoals();
}

/** Lightweight progress-only update for the inline goal progress control. */
export async function setGoalProgress(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const progress = clampProgress(formData.get("progress"));
  const supabase = await createClient();
  await supabase
    .from("personal_goals")
    .update({ progress })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateGoals();
}
