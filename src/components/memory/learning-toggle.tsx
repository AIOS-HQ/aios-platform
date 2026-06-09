"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setLearningAction } from "@/lib/memory/actions";
import { idleState } from "@/lib/types";
import { SubmitButton } from "@/components/shared/submit-button";

/** Owner toggle to enable/disable Harmony auto-learning. */
export function LearningToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations("learning");
  const [state, action] = useActionState(setLearningAction, idleState);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "");
    if (state.status === "error") toast.error(state.message ?? t("errors.saveFailed"));
  }, [state, t]);

  return (
    <form action={action}>
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <SubmitButton
        variant={enabled ? "outline" : "default"}
        pendingLabel={t("saving")}
      >
        {enabled ? t("disable") : t("enable")}
      </SubmitButton>
    </form>
  );
}
