"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";
import { deleteMemory, recordMemory } from "@/lib/memory/service";
import { isMemoryKind } from "@/lib/memory/types";

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
