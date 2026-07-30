-- ============================================================================
-- Sprint 2 (deferred schema) — link a task to a goal.
-- Additive + idempotent. FK is ON DELETE SET NULL so deleting a goal keeps the
-- task. RLS unchanged. Used by the future task↔goal linkage feature PR.
-- ============================================================================

alter table public.personal_tasks
  add column if not exists goal_id uuid
    references public.personal_goals(id) on delete set null;

create index if not exists personal_tasks_goal_idx
  on public.personal_tasks(goal_id);
