"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createGoal, updateGoal } from "@/lib/harmony/goal-actions";
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
import type { GoalStatus, PersonalGoal } from "@/types/database";

const STATUSES: GoalStatus[] = ["active", "paused", "completed", "archived"];

export function GoalDialog({
  goal,
  children,
}: {
  goal?: PersonalGoal;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("goals");
  const tc = useTranslations("common");
  const editing = Boolean(goal);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateGoal(idleState, formData)
      : await createGoal(idleState, formData);
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
          {goal && <input type="hidden" name="id" value={goal.id} />}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="goal-title">{t("fields.title")}</Label>
            <Input
              id="goal-title"
              name="title"
              defaultValue={goal?.title ?? ""}
              maxLength={LIMITS.title}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-desc">{t("fields.description")}</Label>
            <Textarea
              id="goal-desc"
              name="description"
              defaultValue={goal?.description ?? ""}
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-status">{t("fields.status")}</Label>
              <Select name="status" defaultValue={goal?.status ?? "active"}>
                <SelectTrigger id="goal-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-progress">{t("fields.progress")}</Label>
              <Input
                id="goal-progress"
                name="progress"
                type="number"
                min={0}
                max={100}
                step={5}
                defaultValue={goal?.progress ?? 0}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-target">{t("fields.targetDate")}</Label>
            <Input
              id="goal-target"
              name="target_date"
              type="date"
              defaultValue={goal?.target_date ?? ""}
            />
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
