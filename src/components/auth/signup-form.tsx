"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signUp } from "@/lib/auth/actions";
import { idleState } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export function SignupForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action] = useActionState(signUp, idleState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} id="signup-form-message" />
      <div className="space-y-2">
        <Label htmlFor="fullName">{t("fields.fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "signup-form-message" : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("fields.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "signup-form-message" : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("fields.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={state.status === "error"}
          aria-describedby={
            state.status === "error" ? "password-hint signup-form-message" : "password-hint"
          }
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {t("signup.passwordHint")}
        </p>
      </div>
      <SubmitButton className="w-full" pendingLabel={tc("loading")}>
        {t("signup.submit")}
      </SubmitButton>
    </form>
  );
}
