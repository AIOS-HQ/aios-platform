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
import { LoginForm } from "@/components/auth/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
        <CardDescription>{t("login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline"
          >
            {tc("signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
