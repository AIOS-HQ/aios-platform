import type { PersonalTask } from "@/types/database";

/** Pure client-side view helpers for the Tasks page (search/sort/group). */

export type GroupBy = "due" | "status" | "priority";
export type SortBy = "due" | "priority" | "created";

const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
const DUE_LAST = "9999-99-99";

export function sortTasks(tasks: PersonalTask[], sort: SortBy): PersonalTask[] {
  const arr = [...tasks];
  if (sort === "priority") {
    arr.sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] ||
        (a.due_date ?? DUE_LAST).localeCompare(b.due_date ?? DUE_LAST),
    );
  } else if (sort === "created") {
    arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    arr.sort(
      (a, b) =>
        (a.due_date ?? DUE_LAST).localeCompare(b.due_date ?? DUE_LAST) ||
        priorityRank[a.priority] - priorityRank[b.priority],
    );
  }
  return arr;
}

export type TaskGroup = { key: string; tasks: PersonalTask[] };

/** Group tasks for display. Empty groups are omitted. */
export function groupTasks(
  tasks: PersonalTask[],
  groupBy: GroupBy,
  sort: SortBy,
): TaskGroup[] {
  const sorted = sortTasks(tasks, sort);

  if (groupBy === "status") {
    return (["todo", "in_progress", "done"] as const)
      .map((k) => ({ key: `status:${k}`, tasks: sorted.filter((t) => t.status === k) }))
      .filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "priority") {
    return (["high", "medium", "low"] as const)
      .map((k) => ({ key: `priority:${k}`, tasks: sorted.filter((t) => t.priority === k) }))
      .filter((g) => g.tasks.length > 0);
  }

  // groupBy === "due"
  const today = new Date().toISOString().slice(0, 10);
  const done = sorted.filter((t) => t.status === "done");
  const open = sorted.filter((t) => t.status !== "done");

  const groups: TaskGroup[] = [
    { key: "due:overdue", tasks: open.filter((t) => t.due_date && t.due_date < today) },
    { key: "due:today", tasks: open.filter((t) => t.due_date === today) },
    { key: "due:upcoming", tasks: open.filter((t) => t.due_date && t.due_date > today) },
    { key: "due:noDate", tasks: open.filter((t) => !t.due_date) },
    { key: "due:done", tasks: done },
  ];
  return groups.filter((g) => g.tasks.length > 0);
}
