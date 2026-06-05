"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createAgent, updateAgent } from "@/lib/harmony/os/agent-actions";
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
import { AUTONOMY_LEVELS } from "@/lib/harmony/os/autonomy";
import type { Agent } from "@/types/database";

export function AgentDialog({
  departmentId,
  agent,
  children,
}: {
  departmentId?: string;
  agent?: Agent;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("os.agents");
  const ta = useTranslations("os.autonomy");
  const tc = useTranslations("common");
  const editing = Boolean(agent);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateAgent(idleState, formData)
      : await createAgent(idleState, formData);
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
          <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {agent && <input type="hidden" name="id" value={agent.id} />}
          {departmentId && (
            <input type="hidden" name="department_id" value={departmentId} />
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="agent-name">{t("fields.name")}</Label>
            <Input
              id="agent-name"
              name="name"
              defaultValue={agent?.name ?? ""}
              maxLength={LIMITS.name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-role">{t("fields.role")}</Label>
            <Input
              id="agent-role"
              name="role"
              defaultValue={agent?.role ?? ""}
              maxLength={LIMITS.description}
              placeholder={t("rolePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-autonomy">{t("autonomyLabel")}</Label>
            <Select
              name="autonomy_level"
              defaultValue={
                agent?.autonomy_level == null
                  ? "inherit"
                  : String(agent.autonomy_level)
              }
            >
              <SelectTrigger id="agent-autonomy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">{t("inherit")}</SelectItem>
                {AUTONOMY_LEVELS.map((l) => (
                  <SelectItem key={l.level} value={String(l.level)}>
                    {l.level} · {ta(l.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>
              {editing ? tc("save") : tc("create")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
