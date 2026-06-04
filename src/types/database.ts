/**
 * TypeScript row types mirroring the Supabase schema
 * (see `supabase/migrations/` and `docs/database/schema.sql`).
 *
 * The Supabase client is used untyped and results are cast to these types in
 * the `src/lib/data/*` layer. This keeps the setup simple without a generated
 * `Database` type, while still giving full type-safety to the app code.
 */

export type UserRole = "personal_user" | "business_owner" | "admin";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type BrainKind = "note" | "preference" | "goal" | "manual";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  preferred_language: string;
  timezone: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalGoal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  progress: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalBrainEntry {
  id: string;
  user_id: string;
  title: string;
  content: string;
  kind: BrainKind;
  source_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}
