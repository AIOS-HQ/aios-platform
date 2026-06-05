"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { clampAutonomy } from "@/lib/harmony/os/autonomy";
import type { ActionState } from "@/lib/types";
import type { AgentStatus } from "@/types/database";

function revalidateAgents() {
  revalidatePath("/harmony/departments/[id]", "page");
}

/** Parse the optional per-agent autonomy override ("inherit" → null). */
function parseAutonomy(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "inherit");
  return s === "inherit" ? null : clampAutonomy(Number(s));
}

export async function createAgent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const departmentId = String(formData.get("department_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || null;
  if (!departmentId) return { status: "error", message: t("errors.generic") };
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name], [role, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("agents").insert({
    user_id: user.id,
    department_id: departmentId,
    key: "custom",
    name,
    role,
    autonomy_level: parseAutonomy(formData.get("autonomy_level")),
  });
  if (error) {
    console.error("[agent-actions] createAgent", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateAgents();
  return { status: "success", message: t("saved") };
}

export async function updateAgent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() || null;
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!name) return { status: "error", message: t("errors.titleRequired") };
  if (exceedsLimits([[name, LIMITS.name], [role, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("agents")
    .update({
      name,
      role,
      autonomy_level: parseAutonomy(formData.get("autonomy_level")),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[agent-actions] updateAgent", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateAgents();
  return { status: "success", message: t("saved") };
}

/** Toggle an agent active/paused. Receives the desired status. */
export async function setAgentStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AgentStatus;
  if (!id || (status !== "active" && status !== "paused")) return;
  const supabase = await createClient();
  await supabase
    .from("agents")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateAgents();
}

export async function deleteAgent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("agents").delete().eq("id", id).eq("user_id", user.id);
  revalidateAgents();
}
