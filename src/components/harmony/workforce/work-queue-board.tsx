"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { workItemAction } from "@/lib/workforce/work-queue-actions";
import { idleState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export interface WorkItemView {
  id: string;
  agent: string;
  agentName: string;
  title: string;
  status: string;
  risk: string;
  requiresApproval: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  proposed: "outline",
  approved: "default",
  in_progress: "secondary",
  done: "secondary",
  blocked: "destructive",
  dismissed: "outline",
};

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  routine: "outline",
  approval: "default",
  destructive: "destructive",
};

/** Founder controls offered per current status. */
const OPS_FOR_STATUS: Record<string, string[]> = {
  proposed: ["approve", "delegate", "dismiss"],
  approved: ["delegate", "dismiss"],
  in_progress: [],
  done: [],
  blocked: ["dismiss"],
  dismissed: [],
};

/**
 * Work queue board (founder). Create work items and act on them: approve
 * (advisory), approve & delegate (routes through the Approval Center for risky
 * work), or dismiss. Nothing here auto-executes.
 */
export function WorkQueueBoard({
  agents,
  items,
}: {
  agents: { key: string; name: string }[];
  items: WorkItemView[];
}) {
  const t = useTranslations("work");
  const [state, action] = useActionState(workItemAction, idleState);
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
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noWork")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <span className="text-sm font-medium">{it.agentName}</span>
              <span className="text-sm">{it.title}</span>
              <Badge variant={STATUS_VARIANT[it.status] ?? "outline"} className="text-[10px]">
                {t(`status.${it.status}`)}
              </Badge>
              <Badge variant={RISK_VARIANT[it.risk] ?? "outline"} className="text-[10px]">
                {t(`risk.${it.risk}`)}
              </Badge>
              {it.requiresApproval ? (
                <Badge variant="outline" className="text-[10px]">{t("needsApproval")}</Badge>
              ) : null}
              <span className="ml-auto flex gap-1.5">
                {(OPS_FOR_STATUS[it.status] ?? []).map((op) => (
                  <form key={op} action={action}>
                    <input type="hidden" name="op" value={op} />
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="agent" value={it.agent} />
                    <SubmitButton
                      variant={op === "delegate" ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                    >
                      {t(`op.${op}`)}
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
        <select
          name="agent"
          required
          aria-label={t("agentLabel")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {agents.map((a) => (
            <option key={a.key} value={a.key}>{a.name}</option>
          ))}
        </select>
        <input
          name="title"
          required
          maxLength={300}
          placeholder={t("workPlaceholder")}
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <select
          name="risk"
          defaultValue="routine"
          aria-label={t("riskLabel")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="routine">{t("risk.routine")}</option>
          <option value="approval">{t("risk.approval")}</option>
          <option value="destructive">{t("risk.destructive")}</option>
        </select>
        <SubmitButton size="sm">{t("addWork")}</SubmitButton>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
