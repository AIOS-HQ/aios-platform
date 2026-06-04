"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskDialog } from "./task-dialog";
import { TaskItem } from "./task-item";
import { cn } from "@/lib/utils";
import type { PersonalTask, TaskStatus } from "@/types/database";

type Filter = "all" | TaskStatus;
const FILTERS: Filter[] = ["all", "todo", "in_progress", "done"];

export function TaskList({ tasks }: { tasks: PersonalTask[] }) {
  const t = useTranslations("tasks");
  const [filter, setFilter] = useState<Filter>("all");
  const filtered =
    filter === "all" ? tasks : tasks.filter((x) => x.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {f === "all" ? t("filter.all") : t(`status.${f}`)}
            </button>
          ))}
        </div>
        <TaskDialog>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Button>
        </TaskDialog>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <TaskDialog>
            <Button variant="outline">
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </TaskDialog>
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
