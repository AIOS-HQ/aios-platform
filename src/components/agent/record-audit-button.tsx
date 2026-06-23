"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { recordAuditToJuliusAction } from "@/lib/agents/auditor/actions";
import { idleState } from "@/lib/types";
import { SubmitButton } from "@/components/shared/submit-button";

/** Records the current Auditor posture into Julius (cross-agent awareness). */
export function RecordAuditButton() {
  const t = useTranslations("auditor");
  const [state, action] = useActionState(recordAuditToJuliusAction, idleState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "");
    if (state.status === "error") toast.error(state.message ?? t("errors.juliusFailed"));
  }, [state, t]);

  return (
    <form action={action}>
      <SubmitButton variant="outline" size="sm" pendingLabel={t("recording")}>
        {t("recordToJulius")}
      </SubmitButton>
    </form>
  );
}
