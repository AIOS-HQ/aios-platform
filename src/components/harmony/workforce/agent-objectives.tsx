"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { objectiveAction } from "@/lib/workforce/objectives-actions";
import { idleState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export interface ObjectiveView {
  id: string;
  title: string;
  status: string;
  priority: string;
  origin: string;
  progress: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  proposed: "outline",
  active: "default",
  paused: "secondary",
  done: "secondary",
  dismissed: "outline",
};

/** Founder-driven transitions offered per current status. */
const OPS_FOR_STATUS: Record<string, string[]> = {
  proposed: ["promote", "dismiss"],
  active: ["pause", "done"],
  paused: ["promote", "dismiss"],
  done: [],
  dismissed: [],
};

/**
 * Agent objectives panel (founder ↔ agent). Lists objectives with founder
 * controls (activate / pause / done / dismiss) and a create form. Advisory —
 * nothing here executes work; it records intent only.
 */
export function AgentObjectives({
  agent,
  objectives,
}: {
  agent: string;
  objectives: ObjectiveView[];
}) {
  const t = useTranslations("workforce");
  const [state, action] = useActionState(objectiveAction, idleState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex flex-col gap-4">
      {objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noObjectives")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {objectives.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <span className="text-sm font-medium">{o.title}</span>
              <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="text-[10px]">
                {t(`objectiveStatus.${o.status}`)}
              </Badge>
              {o.origin === "agent" ? (
                <Badge variant="outline" className="text-[10px]">{t("proposedByAgent")}</Badge>
              ) : null}
              <span className="ml-auto flex gap-1.5">
                {(OPS_FOR_STATUS[o.status] ?? []).map((op) => (
                  <form key={op} action={action}>
                    <input type="hidden" name="op" value={op} />
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="agent" value={agent} />
                    <SubmitButton variant="outline" size="sm" className="h-7 px-2 text-xs">
                      {t(`objectiveOp.${op}`)}
                    </SubmitButton>
                  </form>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="op" value="create" />
        <input type="hidden" name="agent" value={agent} />
        <input
          name="title"
          required
          maxLength={300}
          placeholder={t("objectivePlaceholder")}
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <select
          name="priority"
          defaultValue="medium"
          aria-label={t("priorityLabel")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="low">{t("objectivePriority.low")}</option>
          <option value="medium">{t("objectivePriority.medium")}</option>
          <option value="high">{t("objectivePriority.high")}</option>
        </select>
        <SubmitButton size="sm">{t("addObjective")}</SubmitButton>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
