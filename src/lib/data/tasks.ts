import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PersonalTask, TaskStatus } from "@/types/database";

/** List the current user's tasks (RLS scopes to the owner). */
export async function listTasks(opts?: {
  status?: TaskStatus | "all";
}): Promise<PersonalTask[]> {
  const supabase = await createClient();
  let query = supabase.from("personal_tasks").select("*");
  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  const { data } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as PersonalTask[] | null) ?? [];
}

/** Open tasks that are due today or overdue. */
export function todayTasks(tasks: PersonalTask[]): PersonalTask[] {
  const today = new Date().toISOString().slice(0, 10);
  return tasks
    .filter((t) => t.status !== "done" && t.due_date && t.due_date <= today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}
