"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Target,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "./task-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import { deleteTask, toggleTaskComplete } from "@/lib/harmony/task-actions";
import { daysUntil, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonalGoal, PersonalTask } from "@/types/database";

const priorityVariant = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
} as const;

export type TaskReorder = {
  index: number;
  count: number;
  busy: boolean;
  onMove: (dir: "up" | "down") => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
};

export function TaskItem({
  task,
  goals = [],
  reorder,
}: {
  task: PersonalTask;
  goals?: PersonalGoal[];
  reorder?: TaskReorder;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const linkedGoal = task.goal_id
    ? goals.find((g) => g.id === task.goal_id)
    : undefined;
  // Optimistic completion: the checkbox flips instantly, then reconciles with
  // the server result after revalidation (foundation pattern for Sprint 2).
  const [done, setOptimisticDone] = useOptimistic(task.status === "done");

  function toggle(next: boolean) {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("done", next ? "true" : "false");
    start(async () => {
      setOptimisticDone(next);
      await toggleTaskComplete(fd);
    });
  }

  const overdue = !done && task.due_date && (daysUntil(task.due_date) ?? 0) < 0;

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3",
        done && "opacity-65",
      )}
      onDragOver={reorder?.onDragOver}
      onDrop={reorder?.onDrop}
    >
      {reorder && (
        <span
          draggable
          onDragStart={reorder.onDragStart}
          className="mt-0.5 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripVertical className="size-4" />
        </span>
      )}
      <Checkbox
        checked={done}
        onCheckedChange={(v) => toggle(Boolean(v))}
        disabled={pending}
        aria-label={done ? t("markIncomplete") : t("markComplete")}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium leading-snug", done && "line-through")}>
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={priorityVariant[task.priority]}>
            {t(`priority.${task.priority}`)}
          </Badge>
          <Badge variant="outline">{t(`status.${task.status}`)}</Badge>
          {task.due_date && (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                overdue && "font-medium text-destructive",
              )}
            >
              {t("due")}: {formatDate(task.due_date, locale)}
            </span>
          )}
          {linkedGoal && (
            <Link
              href={`/harmony/goals/${linkedGoal.id}`}
              className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`${t("fields.goal")}: ${linkedGoal.title}`}
            >
              <Target className="size-3" aria-hidden="true" />
              <span className="truncate">{linkedGoal.title}</span>
            </Link>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {reorder && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => reorder.onMove("up")}
              disabled={reorder.busy || reorder.index === 0}
              aria-label={t("moveUp")}
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => reorder.onMove("down")}
              disabled={reorder.busy || reorder.index === reorder.count - 1}
              aria-label={t("moveDown")}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </>
        )}
        <TaskDialog task={task} goals={goals}>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t("edit")}>
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        </TaskDialog>
        <ConfirmDeleteDialog action={deleteTask} id={task.id} itemTitle={task.title}>
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
    </li>
  );
}
