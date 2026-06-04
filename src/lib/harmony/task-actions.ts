"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";
import type { TaskPriority, TaskStatus } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function revalidateTasks() {
  revalidatePath("/harmony");
  revalidatePath("/harmony/tasks");
}

export async function createTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: t("errors.titleRequired") };

  const supabase = await createClient();
  const { error } = await supabase.from("personal_tasks").insert({
    user_id: user.id,
    title,
    description: orNull(formData.get("description")),
    status: String(formData.get("status") ?? "todo") as TaskStatus,
    priority: String(formData.get("priority") ?? "medium") as TaskPriority,
    due_date: orNull(formData.get("due_date")),
  });
  if (error) return { status: "error", message: error.message };

  revalidateTasks();
  return { status: "success", message: t("saved") };
}

export async function updateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };

  const status = String(formData.get("status") ?? "todo") as TaskStatus;
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_tasks")
    .update({
      title,
      description: orNull(formData.get("description")),
      status,
      priority: String(formData.get("priority") ?? "medium") as TaskPriority,
      due_date: orNull(formData.get("due_date")),
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { status: "error", message: error.message };

  revalidateTasks();
  return { status: "success", message: t("saved") };
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("personal_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateTasks();
}

export async function toggleTaskComplete(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const done = String(formData.get("done") ?? "") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("personal_tasks")
    .update({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateTasks();
}
