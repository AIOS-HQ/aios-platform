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
  category: string | null;
  riskLevel: string;
  decision: string;
  decisionReason: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  proposed: "outline",
  approved: "default",
  in_progress: "secondary",
  done: "secondary",
  blocked: "destructive",
  dismissed: "outline",
};

const RISKLEVEL_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};

const DECISION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  auto_executed: "default",
  notified: "secondary",
  pending_approval: "outline",
  denied: "destructive",
  kill_switch: "destructive",
  lockdown: "destructive",
};

// Ordered safe → restricted so the safe defaults lead the picker.
const CATEGORIES = [
  "operational",
  "research",
  "communications",
  "publishing",
  "financial",
  "code",
  "security",
  "architecture",
  "destructive",
];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

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
 * Work queue board (founder). Create work items (with action category + risk
 * level) and act on them. Each item shows its category, risk level, and the
 * autonomy engine's current decision (with the reason as a tooltip). Nothing
 * here auto-executes; the engine only decides + audits via the autonomy pass.
 */
export function WorkQueueBoard({
  agents,
  items,
}: {
  agents: { key: string; name: string }[];
  items: WorkItemView[];
}) {
  const t = useTranslations("work");
  const ta = useTranslations("autonomy");
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
              {it.category ? (
                <Badge variant="secondary" className="text-[10px]">{ta(`categories.${it.category}`)}</Badge>
              ) : null}
              <Badge variant={RISKLEVEL_VARIANT[it.riskLevel] ?? "outline"} className="text-[10px]">
                {ta(`riskLevel.${it.riskLevel}`)}
              </Badge>
              <Badge
                variant={DECISION_VARIANT[it.decision] ?? "outline"}
                className="text-[10px]"
                title={it.decisionReason}
              >
                {ta(`decisions.${it.decision}`)}
              </Badge>
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
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <input type="hidden" name="op" value="create" />
        <select name="agent" required aria-label={t("agentLabel")} className="h-9 rounded-md border bg-background px-2 text-sm">
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
        <select name="category" defaultValue="operational" aria-label={t("categoryLabel")} className="h-9 rounded-md border bg-background px-2 text-sm">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{ta(`categories.${c}`)}</option>
          ))}
        </select>
        <select name="risk_level" defaultValue="low" aria-label={t("riskLevelLabel")} className="h-9 rounded-md border bg-background px-2 text-sm">
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>{ta(`riskLevel.${r}`)}</option>
          ))}
        </select>
        <SubmitButton size="sm">{t("addWork")}</SubmitButton>
      </form>
      <p className="text-xs text-muted-foreground">{t("restrictedHint")}</p>
      <FormMessage state={state} />
    </div>
  );
}
