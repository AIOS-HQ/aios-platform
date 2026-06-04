import { daysSince } from "@/lib/format";
import type { PersonalGoal, PersonalNote, PersonalTask } from "@/types/database";

export type AdvisorTone = "info" | "warning" | "success";

export type AdvisorRecommendation = {
  id: string;
  /** Translation key under the `advisor.rec` namespace. */
  key: string;
  values?: Record<string, string | number>;
  tone: AdvisorTone;
};

/**
 * Rule-based Life Advisor. Transparent, deterministic recommendations derived
 * from the user's own data — no automation, no hidden actions (AIOS principle:
 * trust before automation). A future sprint can layer AI suggestions on top.
 */
export function buildRecommendations(input: {
  tasks: PersonalTask[];
  goals: PersonalGoal[];
  notes: PersonalNote[];
}): AdvisorRecommendation[] {
  const { tasks, goals, notes } = input;
  const today = new Date().toISOString().slice(0, 10);
  const recs: AdvisorRecommendation[] = [];

  const open = tasks.filter((t) => t.status !== "done");
  const dueToday = open.filter((t) => t.due_date === today);
  const overdue = open.filter((t) => t.due_date && t.due_date < today);

  if (dueToday.length) {
    recs.push({ id: "due-today", key: "dueToday", values: { count: dueToday.length }, tone: "info" });
  }
  if (overdue.length) {
    recs.push({ id: "overdue", key: "overdue", values: { count: overdue.length }, tone: "warning" });
  }

  const staleGoals = goals.filter(
    (g) => g.status === "active" && daysSince(g.updated_at) >= 7,
  );
  if (staleGoals.length) {
    recs.push({ id: "stale-goals", key: "staleGoals", values: { count: staleGoals.length }, tone: "warning" });
  }

  const almost = goals.filter(
    (g) => g.status === "active" && g.progress >= 80 && g.progress < 100,
  );
  if (almost.length) {
    recs.push({ id: "almost", key: "almostThere", values: { count: almost.length }, tone: "info" });
  }

  if (notes.length >= 10) {
    recs.push({ id: "organize-notes", key: "organizeNotes", values: { count: notes.length }, tone: "info" });
  }

  if (tasks.length === 0) {
    recs.push({ id: "first-task", key: "firstTask", tone: "info" });
  }
  if (goals.length === 0) {
    recs.push({ id: "first-goal", key: "firstGoal", tone: "info" });
  }

  if (open.length === 0 && tasks.length > 0 && overdue.length === 0) {
    recs.push({ id: "all-clear", key: "allClear", tone: "success" });
  }

  if (recs.length === 0) {
    recs.push({ id: "on-track", key: "onTrack", tone: "success" });
  }

  return recs;
}
