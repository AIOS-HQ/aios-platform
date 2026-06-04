"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createBrainEntry } from "@/lib/harmony/brain-actions";
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
import { SubmitButton } from "@/components/shared/submit-button";
import { LIMITS } from "@/lib/limits";

export function BrainEntryDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("brain");
  const tc = useTranslations("common");

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await createBrainEntry(idleState, formData);
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
            <Label htmlFor="brain-title">{t("fields.title")}</Label>
            <Input id="brain-title" name="title" maxLength={LIMITS.title} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brain-content">{t("fields.content")}</Label>
            <Textarea
              id="brain-content"
              name="content"
              maxLength={LIMITS.brainContent}
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brain-tags">{t("fields.tags")}</Label>
            <Input id="brain-tags" name="tags" placeholder={t("tagsPlaceholder")} />
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
