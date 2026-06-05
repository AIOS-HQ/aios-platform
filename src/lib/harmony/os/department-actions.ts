"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { autonomyKey, clampAutonomy } from "@/lib/harmony/os/autonomy";
import { emitActivity } from "@/lib/harmony/os/events";
import type { ActionState } from "@/lib/types";
import type { Department } from "@/types/database";

function revalidateDepartments(departmentId?: string) {
  revalidatePath("/harmony");
  revalidatePath("/harmony/companies/[slug]", "page");
  if (departmentId) revalidatePath(`/harmony/departments/${departmentId}`);
}

export async function createDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const companyId = String(formData.get("company_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!companyId) return { status: "error", message: t("errors.generic") };
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    user_id: user.id,
    company_id: companyId,
    key: "custom",
    name,
    description,
    autonomy_level: clampAutonomy(Number(formData.get("autonomy_level") ?? 1)),
  });
  if (error) {
    console.error("[department-actions] createDepartment", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateDepartments();
  return { status: "success", message: t("saved") };
}

export async function updateDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ name, description })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[department-actions] updateDepartment", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateDepartments(id);
  return { status: "success", message: t("saved") };
}

/** Set a department's autonomy level (0–3). Logged to the activity feed. */
export async function setDepartmentAutonomy(
  id: string,
  level: number,
): Promise<void> {
  const user = await requireUser();
  if (!id) return;
  const autonomy = clampAutonomy(level);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({ autonomy_level: autonomy })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("company_id, name")
    .maybeSingle();
  if (error) {
    console.error("[department-actions] setDepartmentAutonomy", error);
    return;
  }

  const dept = data as Pick<Department, "company_id" | "name"> | null;
  const to = await getTranslations("os");
  await emitActivity({
    userId: user.id,
    companyId: dept?.company_id ?? null,
    departmentId: id,
    kind: "department_action",
    summary: to("activity.autonomyChanged", {
      name: dept?.name ?? "",
      level: to(`autonomy.${autonomyKey(autonomy)}`),
    }),
    refType: "department",
    refId: id,
  });

  revalidateDepartments(id);
}

export async function deleteDepartment(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("departments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateDepartments();
}
