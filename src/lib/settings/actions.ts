"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/user";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { isValidTimeZone } from "@/lib/timezones";
import type { ActionState } from "@/lib/types";

const COOKIE_BASE = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (exceedsLimits([[fullName, LIMITS.name]])) {
    const th = await getTranslations("harmony");
    return { status: "error", message: th("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    console.error("[settings-actions] db error", error);
    return {
      status: "error",
      message: (await getTranslations("harmony"))("errors.generic"),
    };
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
  const rawLanguage = String(formData.get("language") ?? "en");
  const rawTimezone = String(formData.get("timezone") ?? "UTC");
  // Validate before persisting — never trust client-supplied values.
  const language = isLocale(rawLanguage) ? rawLanguage : "en";
  const timezone = isValidTimeZone(rawTimezone) ? rawTimezone : "UTC";

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .update({ preferred_language: language, timezone })
    .eq("user_id", user.id);

  if (error) {
    console.error("[settings-actions] db error", error);
    return {
      status: "error",
      message: (await getTranslations("harmony"))("errors.generic"),
    };
  }

  // Keep the UI language cookie in sync with the saved preference.
  if (isLocale(language)) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, language, COOKIE_BASE);
  }

  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

const THEMES = ["system", "light", "dark"] as const;

/**
 * Persists the color theme to user_settings (cross-device) and mirrors it to
 * the `aios-theme` cookie that ThemeScript reads pre-paint. Called from the
 * Settings appearance control, which also applies it on the client instantly.
 */
export async function updateThemePreference(theme: string): Promise<void> {
  const user = await requireUser();
  const value = (THEMES as readonly string[]).includes(theme) ? theme : "system";

  const supabase = await createClient();
  await supabase
    .from("user_settings")
    .update({ theme: value })
    .eq("user_id", user.id);

  const cookieStore = await cookies();
  cookieStore.set("aios-theme", value, COOKIE_BASE);

  revalidatePath("/", "layout");
}

/**
 * Permanently deletes the account + all data. Requires typing the account email
 * to confirm, and the service-role key to be configured (Auth admin API). The
 * `on delete cascade` FKs remove profile/settings/tasks/goals/notes/brain.
 */
export async function deleteAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("settings");
  const user = await requireUser();
  const confirmEmail = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  if (!user.email || confirmEmail !== user.email.toLowerCase()) {
    return { status: "error", message: t("danger.confirmError") };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { status: "error", message: t("danger.notAvailable") };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[settings-actions] db error", error);
    return {
      status: "error",
      message: (await getTranslations("harmony"))("errors.generic"),
    };
  }

  // Clear the now-defunct session, then leave.
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
