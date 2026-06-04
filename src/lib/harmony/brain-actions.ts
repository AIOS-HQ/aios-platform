"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import type { ActionState } from "@/lib/types";

function parseTags(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function createBrainEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title) return { status: "error", message: t("errors.titleRequired") };

  const supabase = await createClient();
  const { error } = await supabase.from("personal_brains").insert({
    user_id: user.id,
    title,
    content,
    kind: "manual",
    tags: parseTags(formData.get("tags")),
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath("/harmony/brain");
  return { status: "success", message: t("saved") };
}

export async function deleteBrainEntry(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("personal_brains")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/harmony/brain");
}
