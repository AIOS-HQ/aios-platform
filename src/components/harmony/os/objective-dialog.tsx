"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createObjective,
  updateObjective,
} from "@/lib/harmony/os/objective-actions";
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
import type { Objective, ObjectiveStatus } from "@/types/database";

type CompanyOpt = { id: string; name: string };
type DeptOpt = { id: string; name: string; company_id: string };

const STATUSES: ObjectiveStatus[] = [
  "active",
  "paused",
  "completed",
  "archived",
];

export function ObjectiveDialog({
  companies,
  departments,
  objective,
  defaultCompanyId,
  children,
}: {
  companies: CompanyOpt[];
  departments: DeptOpt[];
  objective?: Objective;
  defaultCompanyId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(
    objective?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? "",
  );
  const t = useTranslations("os.objectives");
  const ts = useTranslations("os.objectiveStatus");
  const tc = useTranslations("common");
  const editing = Boolean(objective);
  const deptOptions = departments.filter((d) => d.company_id === companyId);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateObjective(idleState, formData)
      : await createObjective(idleState, formData);
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
          {objective && <input type="hidden" name="id" value={objective.id} />}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {editing ? (
            <input type="hidden" name="company_id" value={companyId} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="obj-company">{t("fields.company")}</Label>
              <Select
                name="company_id"
                value={companyId}
                onValueChange={setCompanyId}
              >
                <SelectTrigger id="obj-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="obj-title">{t("fields.title")}</Label>
            <Input
              id="obj-title"
              name="title"
              defaultValue={objective?.title ?? ""}
              maxLength={LIMITS.title}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="obj-outcome">{t("fields.outcome")}</Label>
            <Textarea
              id="obj-outcome"
              name="outcome"
              defaultValue={objective?.outcome ?? ""}
              maxLength={LIMITS.description}
              rows={3}
              placeholder={t("outcomePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="obj-dept">{t("fields.department")}</Label>
              <Select
                name="department_id"
                defaultValue={objective?.department_id ?? "none"}
              >
                <SelectTrigger id="obj-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noDepartment")}</SelectItem>
                  {deptOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="obj-due">{t("fields.dueDate")}</Label>
              <Input
                id="obj-due"
                name="due_date"
                type="date"
                defaultValue={objective?.due_date ?? ""}
              />
            </div>
          </div>

          {editing && (
            <div className="space-y-2">
              <Label htmlFor="obj-status">{t("fields.status")}</Label>
              <Select name="status" defaultValue={objective?.status ?? "active"}>
                <SelectTrigger id="obj-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ts(s)}
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
