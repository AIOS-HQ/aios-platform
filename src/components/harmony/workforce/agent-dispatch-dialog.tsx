"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { dispatchAgentTask } from "@/lib/harmony/agents/a2a-actions";
import { idleState } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { LIMITS } from "@/lib/limits";

type AgentOpt = { key: string; name: string };
const KINDS = ["task", "message"] as const;
const RISKS = ["routine", "approval", "destructive"] as const;

/**
 * Harmony Dispatch — create an agent-to-agent task/message from the UI. The
 * backend attaches Julius context and routes risky/write tasks to approval.
 */
export function AgentDispatchDialog({
  agents,
  children,
}: {
  agents: AgentOpt[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("workforce");
  const tc = useTranslations("common");
  const toOptions = agents.filter((a) => a.key !== "harmony");

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await dispatchAgentTask(idleState, formData);
    if (res.status === "error") {
      setError(res.message ?? "");
      return;
    }
    toast.success(res.message ?? tc("save"));
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dispatchTitle")}</DialogTitle>
          <DialogDescription>{t("dispatchDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dispatch-from">{t("fromAgent")}</Label>
              <Select name="from_agent" defaultValue="harmony">
                <SelectTrigger id="dispatch-from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatch-to">{t("toAgent")}</Label>
              <Select name="to_agent" defaultValue={toOptions[0]?.key ?? ""}>
                <SelectTrigger id="dispatch-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toOptions.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-subject">{t("subjectLabel")}</Label>
            <Input
              id="dispatch-subject"
              name="subject"
              maxLength={LIMITS.title}
              placeholder={t("subjectPlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-body">{t("bodyLabel")}</Label>
            <Textarea
              id="dispatch-body"
              name="body"
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dispatch-kind">{t("kindLabel")}</Label>
              <Select name="kind" defaultValue="task">
                <SelectTrigger id="dispatch-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kind.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatch-risk">{t("riskLabel")}</Label>
              <Select name="risk" defaultValue="routine">
                <SelectTrigger id="dispatch-risk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISKS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`risk.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{t("dispatchButton")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
