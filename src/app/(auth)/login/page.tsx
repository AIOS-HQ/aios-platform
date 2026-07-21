import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/auth/redirects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string; next?: string }>;
}) {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  const { error, redirect, next } = await searchParams;
  const callbackError = error === "auth_callback";
  const redirectTo = safeRedirectPath(redirect ?? next, "");

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-2 px-5 pt-6 text-center sm:px-7 sm:pt-7">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {t("login.title")}
        </h2>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {t("login.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-5 pb-6 sm:px-7 sm:pb-7">
        {callbackError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t("login.callbackError")}
          </p>
        )}
        <LoginForm redirectTo={redirectTo} />
        <p className="text-center text-sm text-slate-300">
          {t("login.noAccount")}{" "}
          <Link
            href="/signup"
            className="font-medium text-sky-200 hover:text-white hover:underline"
          >
            {tc("signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
