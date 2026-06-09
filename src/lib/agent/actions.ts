"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";
import { approveAgentAction, rejectAgentAction } from "@/lib/agent/service";

/** Approve a pending agent action and run its tool. Owner-scoped. */
export async function approveActionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("activity");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: t("errors.notFound") };

  const res = await approveAgentAction(user.id, id);
  if (!res.ok) return { status: "error", message: t("errors.approveFailed") };

  revalidatePath("/settings/activity");
  return { status: "success", message: t("approvedToast") };
}

/** Reject a pending agent action without running it. Owner-scoped. */
export async function rejectActionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("activity");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: t("errors.notFound") };

  const ok = await rejectAgentAction(user.id, id);
  if (!ok) return { status: "error", message: t("errors.rejectFailed") };

  revalidatePath("/settings/activity");
  return { status: "success", message: t("rejectedToast") };
}
