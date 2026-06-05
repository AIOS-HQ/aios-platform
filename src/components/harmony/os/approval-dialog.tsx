"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createApproval } from "@/lib/harmony/os/approval-actions";
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
import { APPROVAL_TYPES } from "@/lib/harmony/os/catalog";
import type { TaskPriority } from "@/types/database";

const RISKS: TaskPriority[] = ["low", "medium", "high"];

export function ApprovalDialog({
  companies,
  children,
}: {
  companies: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("os.approvals");
  const tt = useTranslations("os.approvalType");
  const tp = useTranslations("os.priority");
  const tc = useTranslations("common");

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await createApproval(idleState, formData);
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
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
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
          <div className="space-y-2">
            <Label htmlFor="appr-title">{t("fields.title")}</Label>
            <Input
              id="appr-title"
              name="title"
              maxLength={LIMITS.title}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appr-summary">{t("fields.summary")}</Label>
            <Textarea
              id="appr-summary"
              name="summary"
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="appr-type">{t("fields.type")}</Label>
              <Select name="type" defaultValue="content">
                <SelectTrigger id="appr-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_TYPES.map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {tt(ty)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appr-risk">{t("fields.risk")}</Label>
              <Select name="risk" defaultValue="medium">
                <SelectTrigger id="appr-risk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISKS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tp(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appr-company">{t("fields.company")}</Label>
              <Select name="company_id" defaultValue="none">
                <SelectTrigger id="appr-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noCompany")}</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("create")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
