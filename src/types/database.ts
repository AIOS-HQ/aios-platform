/**
 * TypeScript row types mirroring the Supabase schema
 * (see `supabase/migrations/` and `docs/database/schema.sql`).
 *
 * The Supabase client is used untyped and results are cast to these types in
 * the `src/lib/data/*` layer. This keeps the setup simple without a generated
 * `Database` type, while still giving full type-safety to the app code.
 */

import type { AutonomyLevel } from "@/lib/harmony/os/autonomy";
import type {
  ActivityKind,
  ApprovalType,
  CompanyDomain,
  DepartmentKey,
  WorkStatus,
} from "@/lib/harmony/os/catalog";
import type { ChannelKind } from "@/lib/harmony/comms/catalog";

// Re-export the shared OS domain unions so `@/types/database` stays the single
// row-type home for consumers (data layer, components).
export type { AutonomyLevel } from "@/lib/harmony/os/autonomy";
export type {
  ActivityKind,
  ApprovalType,
  CompanyDomain,
  DepartmentKey,
  WorkStatus,
} from "@/lib/harmony/os/catalog";
export type { ChannelKind } from "@/lib/harmony/comms/catalog";

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
  goal_id: string | null;
  position: number | null;
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
  tags: string[];
  pinned: boolean;
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

// ===========================================================================
// Founder Harmony (L3.5) — Owner Operating System
// Owner → Companies → { Departments → Agents · Objectives · Projects } → Work
// All rows owner-scoped (user_id); see migration 20260601000600.
// ===========================================================================

export type CompanyStatus = "active" | "archived";
export type AgentStatus = "active" | "paused";
export type ObjectiveStatus = "active" | "paused" | "completed" | "archived";
export type ProjectStatus =
  | "planning"
  | "active"
  | "blocked"
  | "done"
  | "archived";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ActivityActor = "founder" | "agent" | "department" | "system";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  domain: CompanyDomain;
  status: CompanyStatus;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  user_id: string;
  company_id: string;
  key: DepartmentKey | string;
  name: string;
  description: string | null;
  autonomy_level: AutonomyLevel;
  status: CompanyStatus;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  user_id: string;
  department_id: string;
  key: string;
  name: string;
  role: string | null;
  status: AgentStatus;
  autonomy_level: AutonomyLevel | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Objective {
  id: string;
  user_id: string;
  company_id: string;
  department_id: string | null;
  title: string;
  outcome: string | null;
  status: ObjectiveStatus;
  progress: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  company_id: string;
  objective_id: string | null;
  department_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkItem {
  id: string;
  user_id: string;
  company_id: string;
  department_id: string | null;
  project_id: string | null;
  objective_id: string | null;
  agent_id: string | null;
  title: string;
  description: string | null;
  status: WorkStatus;
  priority: TaskPriority;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  user_id: string;
  company_id: string | null;
  department_id: string | null;
  agent_id: string | null;
  work_item_id: string | null;
  type: ApprovalType;
  title: string;
  summary: string | null;
  status: ApprovalStatus;
  risk: TaskPriority;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  company_id: string | null;
  department_id: string | null;
  actor_type: ActivityActor;
  actor_id: string | null;
  kind: ActivityKind;
  summary: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

// ===========================================================================
// Communications layer (channels → conversations → messages)
// ===========================================================================

export type ChannelStatus = "disconnected" | "connected" | "error";
export type ConversationStatus = "open" | "pending" | "snoozed" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus =
  | "received"
  | "queued"
  | "awaiting_approval"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Channel {
  id: string;
  user_id: string;
  company_id: string | null;
  department_id: string | null;
  kind: ChannelKind;
  name: string;
  handle: string | null;
  status: ChannelStatus;
  credential_ref: string | null;
  autonomy_level: AutonomyLevel | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  channel_id: string;
  company_id: string | null;
  assigned_agent_id: string | null;
  contact: string;
  subject: string | null;
  status: ConversationStatus;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  conversation_id: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  created_at: string;
}
