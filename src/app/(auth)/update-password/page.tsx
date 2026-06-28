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
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-2 px-5 pt-6 text-center sm:px-7 sm:pt-7">
          <CardTitle className="text-2xl text-white sm:text-3xl">
            {t("update.invalidTitle")}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {t("update.invalidBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-7 sm:pb-7">
          <Button asChild className="w-full">
            <Link href="/reset-password">{t("update.requestNew")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-2 px-5 pt-6 text-center sm:px-7 sm:pt-7">
        <CardTitle className="text-2xl text-white sm:text-3xl">
          {t("update.title")}
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {t("update.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-6 sm:px-7 sm:pb-7">
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
