import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { getCurrentUser } from "@/lib/auth/user";
import { isSupabaseConfigured } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.update");
  return { title: t("title") };
}

export default async function UpdatePasswordPage() {
  const t = await getTranslations("auth");

  // Reaching this page requires the recovery session set by /auth/callback.
  // Without a session the reset link is invalid/expired — guide the user
  // instead of showing a form that would just error on submit.
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;

  if (!user) {
    return (
      <Card>
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{t("update.invalidTitle")}</CardTitle>
          <CardDescription>{t("update.invalidBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/reset-password">{t("update.requestNew")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">{t("update.title")}</CardTitle>
        <CardDescription>{t("update.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
