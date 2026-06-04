"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createNote, updateNote } from "@/lib/harmony/note-actions";
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
import type { PersonalNote } from "@/types/database";

export function NoteDialog({
  note,
  children,
}: {
  note?: PersonalNote;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("notes");
  const tc = useTranslations("common");
  const editing = Boolean(note);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateNote(idleState, formData)
      : await createNote(idleState, formData);
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
          {note && <input type="hidden" name="id" value={note.id} />}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="note-title">{t("fields.title")}</Label>
            <Input
              id="note-title"
              name="title"
              defaultValue={note?.title ?? ""}
              maxLength={LIMITS.title}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-content">{t("fields.content")}</Label>
            <Textarea
              id="note-content"
              name="content"
              defaultValue={note?.content ?? ""}
              maxLength={LIMITS.noteContent}
              rows={8}
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
