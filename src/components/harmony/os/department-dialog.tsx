"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createDepartment,
  updateDepartment,
} from "@/lib/harmony/os/department-actions";
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
import { AUTONOMY_LEVELS } from "@/lib/harmony/os/autonomy";
import type { Department } from "@/types/database";

export function DepartmentDialog({
  companyId,
  department,
  children,
}: {
  companyId?: string;
  department?: Department;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("os.departments");
  const ta = useTranslations("os.autonomy");
  const tc = useTranslations("common");
  const editing = Boolean(department);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateDepartment(idleState, formData)
      : await createDepartment(idleState, formData);
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
          {department && <input type="hidden" name="id" value={department.id} />}
          {companyId && (
            <input type="hidden" name="company_id" value={companyId} />
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
            <Label htmlFor="dept-name">{t("fields.name")}</Label>
            <Input
              id="dept-name"
              name="name"
              defaultValue={department?.name ?? ""}
              maxLength={LIMITS.name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-desc">{t("fields.description")}</Label>
            <Textarea
              id="dept-desc"
              name="description"
              defaultValue={department?.description ?? ""}
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="dept-autonomy-new">{t("autonomyLabel")}</Label>
              <Select name="autonomy_level" defaultValue="1">
                <SelectTrigger id="dept-autonomy-new">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTONOMY_LEVELS.map((l) => (
                    <SelectItem key={l.level} value={String(l.level)}>
                      {l.level} · {ta(l.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
