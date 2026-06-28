"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { safeRedirectPath } from "@/lib/auth/redirects";
import type { ActionState } from "@/lib/types";

/** Maps a Supabase auth error to a localized, user-friendly message. */
async function authErrorMessage(error: AuthError): Promise<string> {
  const t = await getTranslations("auth.errors");
  const map: Record<string, string> = {
    invalid_credentials: t("invalidCredentials"),
    email_not_confirmed: t("emailNotConfirmed"),
    user_already_exists: t("userExists"),
    email_exists: t("userExists"),
    weak_password: t("weakPassword"),
    over_request_rate_limit: t("rateLimit"),
    over_email_send_rate_limit: t("rateLimit"),
    validation_failed: t("validationFailed"),
  };
  return (error.code && map[error.code]) || error.message || t("generic");
}

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auth.errors");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirect") ?? formData.get("next"));

  if (!email || !password) {
    return { status: "error", message: t("missingFields") };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: t("notConfigured") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { status: "error", message: await authErrorMessage(error) };
  }

  redirect(redirectTo);
}

export async function signUp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auth");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", message: t("errors.missingFields") };
  }
  if (password.length < 8) {
    return { status: "error", message: t("errors.weakPassword") };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: t("errors.notConfigured") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${env.siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { status: "error", message: await authErrorMessage(error) };
  }

  // If email confirmation is disabled, a session is returned immediately.
  if (data.session) {
    redirect("/harmony");
  }

  return { status: "success", message: t("signup.checkEmail") };
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auth");
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { status: "error", message: t("errors.missingFields") };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: t("errors.notConfigured") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/update-password`,
  });

  if (error) {
    return { status: "error", message: await authErrorMessage(error) };
  }

  // Always report success to avoid leaking which emails are registered.
  return { status: "success", message: t("reset.sent") };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("auth");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { status: "error", message: t("errors.weakPassword") };
  }
  if (password !== confirm) {
    return { status: "error", message: t("errors.passwordMismatch") };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: t("errors.notConfigured") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: "error", message: await authErrorMessage(error) };
  }

  redirect("/harmony");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
