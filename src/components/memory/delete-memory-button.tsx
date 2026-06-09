"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { deleteMemoryAction } from "@/lib/memory/actions";
import { idleState } from "@/lib/types";
import { SubmitButton } from "@/components/shared/submit-button";

/** Owner-only delete for a single memory. */
export function DeleteMemoryButton({ id }: { id: string }) {
  const t = useTranslations("memory");
  const [state, action] = useActionState(deleteMemoryAction, idleState);

  useEffect(() => {
    if (state.status === "error") {
      toast.error(state.message ?? t("errors.deleteFailed"));
    }
  }, [state, t]);

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" pendingLabel={t("deleting")}>
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("deleteButton")}</span>
      </SubmitButton>
    </form>
  );
}
