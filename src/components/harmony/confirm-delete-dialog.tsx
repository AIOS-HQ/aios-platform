"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";

/** Reusable confirm-before-delete dialog wrapping a server action. */
export function ConfirmDeleteDialog({
  action,
  id,
  itemTitle,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  itemTitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tc = useTranslations("common");
  const th = useTranslations("harmony");

  async function onConfirm(formData: FormData) {
    await action(formData);
    setOpen(false);
    toast.success(th("deleted"));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{th("confirmDelete.title")}</DialogTitle>
          <DialogDescription>
            {itemTitle
              ? th("confirmDelete.body", { title: itemTitle })
              : th("confirmDelete.bodyGeneric")}
          </DialogDescription>
        </DialogHeader>
        <form action={onConfirm}>
          <input type="hidden" name="id" value={id} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <SubmitButton variant="destructive" pendingLabel={tc("loading")}>
              {tc("delete")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
