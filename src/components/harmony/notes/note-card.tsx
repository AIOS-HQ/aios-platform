"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { BrainCircuit, Pencil, Pin, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NoteDialog } from "./note-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import {
  deleteNote,
  saveNoteToBrain,
  toggleNotePinned,
} from "@/lib/harmony/note-actions";
import { formatDate } from "@/lib/format";
import type { PersonalNote } from "@/types/database";

export function NoteCard({ note }: { note: PersonalNote }) {
  const t = useTranslations("notes");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [pinPending, startPin] = useTransition();

  function saveToBrain() {
    const fd = new FormData();
    fd.set("id", note.id);
    start(async () => {
      await saveNoteToBrain(fd);
      toast.success(t("savedToBrain"));
    });
  }

  function togglePin() {
    const fd = new FormData();
    fd.set("id", note.id);
    fd.set("pinned", String(!note.pinned));
    startPin(async () => {
      await toggleNotePinned(fd);
      toast.success(note.pinned ? t("unpinned") : t("pinnedToast"));
    });
  }

  return (
    <Card className={cn("flex flex-col", note.pinned && "border-primary/40")}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <h3 className="min-w-0 truncate font-semibold">
          {note.title || t("untitled")}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-8",
              note.pinned ? "text-primary" : "text-muted-foreground",
            )}
            onClick={togglePin}
            disabled={pinPending}
            aria-label={note.pinned ? t("unpin") : t("pin")}
            aria-pressed={note.pinned}
          >
            <Pin
              className={cn("size-4", note.pinned && "fill-current")}
              aria-hidden="true"
            />
          </Button>
          <NoteDialog note={note}>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("edit")}>
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </NoteDialog>
          <ConfirmDeleteDialog action={deleteNote} id={note.id} itemTitle={note.title || t("untitled")}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={tc("delete")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
          {note.content || "—"}
        </p>
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {formatDate(note.updated_at, locale)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={saveToBrain}
            disabled={pending}
            className="text-xs"
          >
            <BrainCircuit className="size-3.5" aria-hidden="true" />
            {t("saveToBrain")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
