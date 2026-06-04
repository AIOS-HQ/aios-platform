"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signIn } from "@/lib/auth/actions";
import { idleState } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action] = useActionState(signIn, idleState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="space-y-2">
        <Label htmlFor="email">{t("fields.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("fields.password")}</Label>
          <Link
            href="/reset-password"
            className="text-sm text-primary hover:underline"
          >
            {t("login.forgot")}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <SubmitButton className="w-full" pendingLabel={tc("loading")}>
        {t("login.submit")}
      </SubmitButton>
    </form>
  );
}
