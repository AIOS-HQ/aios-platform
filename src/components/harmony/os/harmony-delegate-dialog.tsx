"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { delegateToHarmony } from "@/lib/harmony/os/delegate-actions";
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

type CompanyOpt = { id: string; name: string };
type DeptOpt = { id: string; name: string; company_id: string };
type ObjectiveOpt = { id: string; name: string };

/**
 * "Tell Harmony what to do." Creates a work item and routes it to the chosen
 * helper department, which executes or requests approval per its autonomy.
 */
export function HarmonyDelegateDialog({
  companies,
  objectives,
  departments,
  children,
}: {
  companies: CompanyOpt[];
  objectives: ObjectiveOpt[];
  departments: DeptOpt[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const t = useTranslations("os.delegate");
  const tc = useTranslations("common");
  const deptOptions = departments.filter((d) => d.company_id === companyId);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await delegateToHarmony(idleState, formData);
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
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="delegate-title">{t("fields.instruction")}</Label>
            <Input
              id="delegate-title"
              name="title"
              maxLength={LIMITS.title}
              placeholder={t("instructionPlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delegate-desc">{t("fields.details")}</Label>
            <Textarea
              id="delegate-desc"
              name="description"
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delegate-company">{t("fields.company")}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="delegate-company">
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


            <div className="space-y-2">
  <Label htmlFor="delegate-objective">Objective</Label>
  <Select name="objective_id" defaultValue="none">
    <SelectTrigger id="delegate-objective">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="none">No objective</SelectItem>
      {objectives.map((o) => (
        <SelectItem key={o.id} value={o.id}>
          {o.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
            <div className="space-y-2">
              <Label htmlFor="delegate-dept">{t("fields.department")}</Label>
              <Select name="department_id" defaultValue="none">
                <SelectTrigger id="delegate-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("unassigned")}</SelectItem>
                  {deptOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={t("working")}>{t("button")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
