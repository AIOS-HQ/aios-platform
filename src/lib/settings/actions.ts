"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import type { ActionState } from "@/lib/types";

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/harmony");
  return { status: "success", message: t("saved") };
}

export async function updatePreferences(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const language = String(formData.get("language") ?? "en");
  const timezone = String(formData.get("timezone") ?? "UTC");

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .update({ preferred_language: language, timezone })
    .eq("user_id", user.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  // Keep the UI language cookie in sync with the saved preference.
  if (isLocale(language)) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}
