"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { connectApiKeyAction } from "@/lib/integrations/connect-actions";
import { idleState } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

/** Per-user API-key connect form for api_key connectors (Supabase, Vercel). */
export function ConnectKeyForm({
  provider,
  tokenLabel,
  accountLabel,
  accountPlaceholder,
}: {
  provider: string;
  tokenLabel: string;
  accountLabel: string;
  accountPlaceholder: string;
}) {
  const t = useTranslations("diagnostics");
  const [state, action] = useActionState(connectApiKeyAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "");
      formRef.current?.reset();
    }
    if (state.status === "error") toast.error(state.message ?? "");
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="provider" value={provider} />
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-token`}>{tokenLabel}</Label>
        <Input
          id={`${provider}-token`}
          name="token"
          type="password"
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${provider}-account`}>{accountLabel}</Label>
        <Input
          id={`${provider}-account`}
          name="account"
          autoComplete="off"
          placeholder={accountPlaceholder}
        />
      </div>
      <SubmitButton pendingLabel={t("connecting")}>{t("connect")}</SubmitButton>
    </form>
  );
}
