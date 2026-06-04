"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ListTodo, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskDialog } from "./task-dialog";
import { TaskItem } from "./task-item";
import { groupTasks, type GroupBy, type SortBy } from "@/lib/harmony/task-view";
import type { PersonalTask } from "@/types/database";

export function TaskList({ tasks }: { tasks: PersonalTask[] }) {
  const t = useTranslations("tasks");
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("due");
  const [sort, setSort] = useState<SortBy>("due");
  const [newOpen, setNewOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: "/" focuses search, "n" opens a new task.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (
        (e.key === "n" || e.key === "N") &&
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setNewOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(needle) ||
        (task.description ?? "").toLowerCase().includes(needle),
    );
  }, [tasks, query]);

  const groups = useMemo(
    () => groupTasks(filtered, groupBy, sort),
    [filtered, groupBy, sort],
  );

  function groupLabel(key: string): string {
    const [kind, value] = key.split(":");
    if (kind === "status") return t(`status.${value}`);
    if (kind === "priority") return t(`priority.${value}`);
    if (value === "done") return t("status.done");
    return t(`groups.${value}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortBy)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label={t("sort.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">{t("sort.due")}</SelectItem>
              <SelectItem value="priority">{t("sort.priority")}</SelectItem>
              <SelectItem value="created">{t("sort.created")}</SelectItem>
            </SelectContent>
          </Select>
          <TaskDialog open={newOpen} onOpenChange={setNewOpen}>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("new")}
            </Button>
          </TaskDialog>
        </div>
      </div>

      <SegmentedControl<GroupBy>
        ariaLabel={t("groupBy.label")}
        value={groupBy}
        onChange={setGroupBy}
        options={[
          { value: "due", label: t("groupBy.due") },
          { value: "status", label: t("groupBy.status") },
          { value: "priority", label: t("groupBy.priority") },
        ]}
      />

      {tasks.length === 0 ? (
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
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("noResults.title")}
          description={t("noResults.description")}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={groupLabel(g.key)}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                {groupLabel(g.key)}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                  {g.tasks.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {g.tasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
