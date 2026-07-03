"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { objectiveAction } from "@/lib/workforce/objectives-actions";
import { workItemAction } from "@/lib/workforce/work-queue-actions";
import { idleState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export interface ReviewObjective {
  id: string;
  agent: string;
  agentName: string;
  title: string;
}

export interface ReviewWork {
  id: string;
  agent: string;
  agentName: string;
  title: string;
  risk: string;
}

export interface ReviewApproval {
  approvalId: string;
  agent: string;
  agentName: string;
  label: string;
  destructive: boolean;
}

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  routine: "outline",
  approval: "default",
  destructive: "destructive",
};

const OBJ_OPS: [string, string][] = [
  ["promote", "activate"],
  ["dismiss", "dismiss"],
];
const WORK_OPS: [string, string][] = [
  ["approve", "approve"],
  ["delegate", "delegate"],
  ["dismiss", "dismiss"],
];

/**
 * Central founder review queue for proposed objectives, queued work, and
 * pending autonomy approvals (approval_payloads). Objective/work reuse their
 * server actions; autonomy approvals post to the approve/reject route which
 * resumes or blocks the exact saved execution.
 */
export function ReviewQueue({
  objectives,
  work,
  approvals = [],
}: {
  objectives: ReviewObjective[];
  work: ReviewWork[];
  approvals?: ReviewApproval[];
}) {
  const t = useTranslations("review");
  const [objState, objAction] = useActionState(objectiveAction, idleState);
  const [workState, workAction] = useActionState(workItemAction, idleState);
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (objState.status === "success" || workState.status === "success") router.refresh();
  }, [objState, workState, router]);

  async function decide(approvalId: string, decision: "approve" | "reject") {
    let reason: string | undefined;
    if (decision === "reject") {
      const entered = window.prompt("Reason for rejecting this action:");
      if (entered === null) return; // cancelled
      reason = entered;
    }
    setBusyId(approvalId);
    try {
      await fetch("/api/harmony/autonomy/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id: approvalId, decision, reason }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("objectivesSection")}
        </h3>
        <FormMessage state={objState} />
        {objectives.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {objectives.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Badge variant="secondary" className="text-[10px]">{o.agentName}</Badge>
                <span className="text-sm font-medium">{o.title}</span>
                <span className="ml-auto flex gap-1.5">
                  {OBJ_OPS.map(([op, label]) => (
                    <form key={op} action={objAction}>
                      <input type="hidden" name="op" value={op} />
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="agent" value={o.agent} />
                      <SubmitButton
                        variant={op === "promote" ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        {t(label)}
                      </SubmitButton>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workSection")}
        </h3>
        <FormMessage state={workState} />
        {work.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {work.map((wk) => (
              <li key={wk.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Badge variant="secondary" className="text-[10px]">{wk.agentName}</Badge>
                <span className="text-sm">{wk.title}</span>
                <Badge variant={RISK_VARIANT[wk.risk] ?? "outline"} className="text-[10px]">
                  {t(`risk.${wk.risk}`)}
                </Badge>
                <span className="ml-auto flex gap-1.5">
                  {WORK_OPS.map(([op, label]) => (
                    <form key={op} action={workAction}>
                      <input type="hidden" name="op" value={op} />
                      <input type="hidden" name="id" value={wk.id} />
                      <input type="hidden" name="agent" value={wk.agent} />
                      <SubmitButton
                        variant={op === "delegate" ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        {t(label)}
                      </SubmitButton>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pending Approvals
        </h3>
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {approvals.map((a) => (
              <li key={a.approvalId} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Badge variant="secondary" className="text-[10px]">{a.agentName}</Badge>
                <span className="text-sm font-medium">{a.label}</span>
                {a.destructive ? (
                  <Badge variant="destructive" className="text-[10px]">HIGH RISK</Badge>
                ) : null}
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === a.approvalId}
                    onClick={() => decide(a.approvalId, "approve")}
                    className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {t("approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === a.approvalId}
                    onClick={() => decide(a.approvalId, "reject")}
                    className="h-7 rounded-md border px-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {t("dismiss")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
