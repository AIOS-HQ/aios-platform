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
import { SignupForm } from "@/components/auth/signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

export default async function SignupPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-2 px-5 pt-6 text-center sm:px-7 sm:pt-7">
        <CardTitle className="text-2xl text-white sm:text-3xl">
          {t("signup.title")}
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {t("signup.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-5 pb-6 sm:px-7 sm:pb-7">
        <SignupForm />
        <p className="text-center text-sm text-slate-300">
          {t("signup.haveAccount")}{" "}
          <Link
            href="/login"
            className="font-medium text-sky-200 hover:text-white hover:underline"
          >
            {tc("logIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
