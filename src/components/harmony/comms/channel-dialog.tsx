"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createChannel } from "@/lib/harmony/comms/comms-actions";
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
import { CHANNEL_TEMPLATES } from "@/lib/harmony/comms/catalog";

type CompanyOpt = { id: string; name: string };
type DeptOpt = { id: string; name: string; company_id: string };

export function ChannelDialog({
  companies,
  departments,
  children,
}: {
  companies: CompanyOpt[];
  departments: DeptOpt[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState("none");
  const t = useTranslations("os.comms");
  const tk = useTranslations("os.channelKind");
  const tc = useTranslations("common");
  const deptOptions = departments.filter((d) => d.company_id === companyId);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await createChannel(idleState, formData);
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
          <DialogTitle>{t("addChannel")}</DialogTitle>
          <DialogDescription>{t("addChannelDesc")}</DialogDescription>
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
            <Label htmlFor="ch-kind">{t("fields.channel")}</Label>
            <Select name="kind" defaultValue="web_chat">
              <SelectTrigger id="ch-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TEMPLATES.map((c) => (
                  <SelectItem key={c.kind} value={c.kind}>
                    {tk(c.kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ch-name">{t("fields.name")}</Label>
            <Input id="ch-name" name="name" maxLength={LIMITS.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ch-handle">{t("fields.handle")}</Label>
            <Input
              id="ch-handle"
              name="handle"
              maxLength={LIMITS.name}
              placeholder={t("handlePlaceholder")}
            />
          </div>
          {companies.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ch-company">{t("fields.company")}</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="ch-company">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("ownerWide")}</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ch-dept">{t("fields.department")}</Label>
                <Select name="department_id" defaultValue="none">
                  <SelectTrigger id="ch-dept">
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
          )}
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("create")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
