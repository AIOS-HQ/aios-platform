"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import { executeWorkItem } from "@/lib/harmony/os/execution";
import type { ActionState } from "@/lib/types";
import type { WorkItem } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}

function revalidate() {
  revalidatePath("/harmony");
  revalidatePath("/harmony/work");
  revalidatePath("/harmony/activity");
  revalidatePath("/harmony/approvals");
}

/**
 * Harmony receives an instruction and delegates it to a helper department:
 * creates a work item, logs it, then runs it through the department's autonomy
 * policy (auto-execute, or route to the Approval Center).
 */
export async function delegateToHarmony(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const companyId = String(formData.get("company_id") ?? "");
  const departmentId = refOrNull(formData.get("department_id"));
  const title = String(formData.get("title") ?? "").trim();
  const description = orNull(formData.get("description"));
  if (!companyId) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[title, LIMITS.title], [description, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_items")
    .insert({
      user_id: user.id,
      company_id: companyId,
      department_id: departmentId,
      objective_id: refOrNull(formData.get("objective_id")),
      title,
      description,
      status: "pending",
      priority: "medium",
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[delegate-actions] delegateToHarmony", error);
    return { status: "error", message: t("errors.generic") };
  }

  const item = data as WorkItem;
  await emitActivity({
    userId: user.id,
    companyId,
    departmentId,
    actorType: "founder",
    kind: "system",
    summary: to("activity.delegated", { title }),
    refType: "work_item",
    refId: item.id,
  });

  const outcome = await executeWorkItem(supabase, user.id, item);
  revalidate();
  return {
    status: "success",
    message: outcome === "completed" ? to("delegate.done") : to("delegate.routed"),
  };
}

/** Re-run a pending/blocked work item through its autonomy policy. */
export async function runWorkItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return;
  await executeWorkItem(supabase, user.id, data as WorkItem);
  revalidate();
}
