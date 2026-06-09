"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";
import { deleteMemory, recordMemory } from "@/lib/memory/service";
import { isMemoryKind } from "@/lib/memory/types";
import { setLearningEnabled, setLearningApproval } from "@/lib/memory/learning";

/** Manually add a memory (user action). Owner-scoped via the RLS server client. */
export async function addMemoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("memory");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const kind = String(formData.get("kind") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!isMemoryKind(kind)) return { status: "error", message: t("errors.invalidKind") };
  if (!content) return { status: "error", message: t("errors.empty") };

  const saved = await recordMemory({
    userId: user.id,
    kind,
    content,
    source: "manual",
  });
  if (!saved) return { status: "error", message: t("errors.saveFailed") };

  revalidatePath("/settings/memory");
  return { status: "success", message: t("addedToast") };
}

/** Delete one of the current user's memories. */
export async function deleteMemoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("memory");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: t("errors.notFound") };

  const ok = await deleteMemory(user.id, id);
  if (!ok) return { status: "error", message: t("errors.deleteFailed") };

  revalidatePath("/settings/memory");
  return { status: "success", message: t("deletedToast") };
}

/** Enable or disable Harmony auto-learning for the current user. */
export async function setLearningAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("learning");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const enabled = String(formData.get("enabled") ?? "") === "true";
  const ok = await setLearningEnabled(user.id, enabled);
  if (!ok) return { status: "error", message: t("errors.saveFailed") };

  revalidatePath("/settings/learning");
  return {
    status: "success",
    message: enabled ? t("enabledToast") : t("disabledToast"),
  };
}

/** Require (or stop requiring) approval before new automatic memories are saved. */
export async function setLearningApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("learning");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };

  const requireApproval = String(formData.get("requireApproval") ?? "") === "true";
  const ok = await setLearningApproval(user.id, requireApproval);
  if (!ok) return { status: "error", message: t("errors.saveFailed") };

  revalidatePath("/settings/learning");
  return {
    status: "success",
    message: requireApproval
      ? t("approvalEnabledToast")
      : t("approvalDisabledToast"),
  };
}
