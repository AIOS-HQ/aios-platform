"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setLearningApprovalAction } from "@/lib/memory/actions";
import { idleState } from "@/lib/types";
import { SubmitButton } from "@/components/shared/submit-button";

/** Owner toggle: require approval before new automatic memories are saved. */
export function LearningApprovalToggle({
  requireApproval,
}: {
  requireApproval: boolean;
}) {
  const t = useTranslations("learning");
  const [state, action] = useActionState(setLearningApprovalAction, idleState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "");
    if (state.status === "error") toast.error(state.message ?? t("errors.saveFailed"));
  }, [state, t]);

  return (
    <form action={action}>
      <input
        type="hidden"
        name="requireApproval"
        value={requireApproval ? "false" : "true"}
      />
      <SubmitButton
        variant={requireApproval ? "outline" : "default"}
        pendingLabel={t("saving")}
      >
        {requireApproval ? t("disableApproval") : t("enableApproval")}
      </SubmitButton>
    </form>
  );
}
