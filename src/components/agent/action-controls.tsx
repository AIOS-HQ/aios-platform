"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { approveActionAction, rejectActionAction } from "@/lib/agent/actions";
import { idleState } from "@/lib/types";
import { SubmitButton } from "@/components/shared/submit-button";

/** Owner approve/reject controls for a single pending agent action. */
export function ActionControls({ id }: { id: string }) {
  const t = useTranslations("activity");
  const [approveState, approve] = useActionState(approveActionAction, idleState);
  const [rejectState, reject] = useActionState(rejectActionAction, idleState);

  useEffect(() => {
    if (approveState.status === "success")
      toast.success(approveState.message ?? t("approvedToast"));
    if (approveState.status === "error")
      toast.error(approveState.message ?? t("errors.approveFailed"));
  }, [approveState, t]);

  useEffect(() => {
    if (rejectState.status === "success")
      toast.success(rejectState.message ?? t("rejectedToast"));
    if (rejectState.status === "error")
      toast.error(rejectState.message ?? t("errors.rejectFailed"));
  }, [rejectState, t]);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <form action={approve}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton size="sm" pendingLabel={t("approving")}>
          <Check className="size-4" aria-hidden="true" />
          {t("approve")}
        </SubmitButton>
      </form>
      <form action={reject}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton size="sm" variant="outline" pendingLabel={t("rejecting")}>
          <X className="size-4" aria-hidden="true" />
          {t("reject")}
        </SubmitButton>
      </form>
    </div>
  );
}
