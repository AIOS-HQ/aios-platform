"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TaskDialog } from "./task-dialog";
import { TaskItem } from "./task-item";
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
        <SegmentedControl
          ariaLabel={t("filterLabel")}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === "all" ? t("filter.all") : t(`status.${f}`),
          }))}
        />
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
