"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createConversation } from "@/lib/harmony/comms/comms-actions";
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

export function ConversationDialog({
  channels,
  children,
}: {
  channels: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("os.comms");
  const tc = useTranslations("common");

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await createConversation(idleState, formData);
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
          <DialogTitle>{t("newConversation")}</DialogTitle>
          <DialogDescription>{t("newConversationDesc")}</DialogDescription>
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
            <Label htmlFor="cv-channel">{t("fields.channel")}</Label>
            <Select name="channel_id" defaultValue={channels[0]?.id}>
              <SelectTrigger id="cv-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cv-contact">{t("fields.contact")}</Label>
            <Input
              id="cv-contact"
              name="contact"
              maxLength={LIMITS.name}
              placeholder={t("contactPlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cv-subject">{t("fields.subject")}</Label>
            <Input id="cv-subject" name="subject" maxLength={LIMITS.title} />
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("create")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
