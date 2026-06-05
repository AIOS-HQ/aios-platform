import type {
  PersonalGoal,
  PersonalNote,
  PersonalTask,
} from "@/types/database";

/**
 * Deterministic fixture builders for Harmony row types. Each builder fills in
 * sensible defaults and accepts overrides for the fields a test cares about.
 */

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

const BASE_TS = "2026-01-01T00:00:00.000Z";

export function makeTask(overrides: Partial<PersonalTask> = {}): PersonalTask {
  return {
    id: nextId("task"),
    user_id: "user-1",
    title: "Task",
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    goal_id: null,
    position: null,
    completed_at: null,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<PersonalGoal> = {}): PersonalGoal {
  return {
    id: nextId("goal"),
    user_id: "user-1",
    title: "Goal",
    description: null,
    status: "active",
    progress: 0,
    target_date: null,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    ...overrides,
  };
}

export function makeNote(overrides: Partial<PersonalNote> = {}): PersonalNote {
  return {
    id: nextId("note"),
    user_id: "user-1",
    title: "Note",
    content: "",
    tags: [],
    pinned: false,
    created_at: BASE_TS,
    updated_at: BASE_TS,
    ...overrides,
  };
}
