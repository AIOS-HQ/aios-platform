-- ============================================================================
-- Sprint 2 (deferred schema) — note tags + pinning.
-- Additive + idempotent. RLS unchanged. Used by the future Notes advanced
-- features (tags + pinning; see issue "Notes Advanced Features").
-- ============================================================================

alter table public.personal_notes
  add column if not exists tags text[] not null default '{}';

alter table public.personal_notes
  add column if not exists pinned boolean not null default false;

create index if not exists personal_notes_pinned_idx
  on public.personal_notes(user_id, pinned);
