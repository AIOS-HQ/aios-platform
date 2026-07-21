"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestPasswordReset } from "@/lib/auth/actions";
import { idleState } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action] = useActionState(requestPasswordReset, idleState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} id="reset-form-message" />
      <div className="space-y-2">
        <Label htmlFor="email">{t("fields.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "reset-form-message" : undefined}
        />
      </div>
      <SubmitButton className="w-full" pendingLabel={tc("loading")}>
        {t("reset.submit")}
      </SubmitButton>
    </form>
  );
}
