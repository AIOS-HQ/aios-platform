"use client";

import { useOptimistic, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleTaskComplete } from "@/lib/harmony/task-actions";
import { daysUntil, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PersonalTask } from "@/types/database";

/** Compact, optimistically-completable task row for the dashboard. */
export function TodayTaskRow({ task }: { task: PersonalTask }) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(task.status === "done");

  function toggle(next: boolean) {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("done", next ? "true" : "false");
    start(async () => {
      setDone(next);
      await toggleTaskComplete(fd);
    });
  }

  const overdue =
    !done && task.due_date && (daysUntil(task.due_date) ?? 0) < 0;

  return (
    <li className="flex items-center gap-3">
      <Checkbox
        checked={done}
        onCheckedChange={(v) => toggle(Boolean(v))}
        disabled={pending}
        aria-label={done ? t("markIncomplete") : t("markComplete")}
        className="size-4"
      />
      <span
        className={cn(
          "flex-1 truncate text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.due_date && (
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground",
            overdue && "font-medium text-destructive",
          )}
        >
          {formatDate(task.due_date, locale)}
        </span>
      )}
    </li>
  );
}
