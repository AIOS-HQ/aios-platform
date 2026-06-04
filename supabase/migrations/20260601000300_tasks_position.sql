-- ============================================================================
-- Sprint 2 (deferred schema) — manual task ordering for drag-reorder.
-- Additive + idempotent. RLS unchanged (existing owner policies cover the new
-- column). The app does not use this column until the Tasks reorder feature PR.
-- ============================================================================

alter table public.personal_tasks
  add column if not exists position integer;

create index if not exists personal_tasks_position_idx
  on public.personal_tasks(user_id, position);
