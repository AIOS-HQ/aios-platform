"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createTask, updateTask } from "@/lib/harmony/task-actions";
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
import type { PersonalTask } from "@/types/database";

export function TaskDialog({
  task,
  children,
  open: openProp,
  onOpenChange,
}: {
  task?: PersonalTask;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const editing = Boolean(task);
  const open = openProp ?? internalOpen;

  function handleOpenChange(next: boolean) {
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setError(null);
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateTask(idleState, formData)
      : await createTask(idleState, formData);
    if (res.status === "error") {
      setError(res.message ?? "");
      return;
    }
    toast.success(res.message ?? tc("save"));
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {task && <input type="hidden" name="id" value={task.id} />}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="task-title">{t("fields.title")}</Label>
            <Input
              id="task-title"
              name="title"
              defaultValue={task?.title ?? ""}
              maxLength={LIMITS.title}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">{t("fields.description")}</Label>
            <Textarea
              id="task-desc"
              name="description"
              defaultValue={task?.description ?? ""}
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-priority">{t("fields.priority")}</Label>
              <Select name="priority" defaultValue={task?.priority ?? "medium"}>
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priority.low")}</SelectItem>
                  <SelectItem value="medium">{t("priority.medium")}</SelectItem>
                  <SelectItem value="high">{t("priority.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-status">{t("fields.status")}</Label>
              <Select name="status" defaultValue={task?.status ?? "todo"}>
                <SelectTrigger id="task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{t("status.todo")}</SelectItem>
                  <SelectItem value="in_progress">
                    {t("status.in_progress")}
                  </SelectItem>
                  <SelectItem value="done">{t("status.done")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">{t("fields.dueDate")}</Label>
            <Input
              id="task-due"
              name="due_date"
              type="date"
              defaultValue={task?.due_date ?? ""}
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
