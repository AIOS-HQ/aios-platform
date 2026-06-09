-- ============================================================================
-- AIOS Core — Harmony Auto-Learning settings (AI Agent Stack, Phase 5)
--
-- One owner-private row per user controlling whether Harmony may auto-capture
-- memories from activity. Default ON; the owner can disable learning entirely.
-- Manual memory management (add/review/delete) is NOT affected by this flag.
--
-- Additive + idempotent. Owner-private via RLS. No existing tables are modified.
-- ============================================================================

create table if not exists public.learning_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_learning_settings_updated_at on public.learning_settings;
create trigger set_learning_settings_updated_at before update on public.learning_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — each row is private to its owner (full CRUD).
-- ---------------------------------------------------------------------------
alter table public.learning_settings enable row level security;

drop policy if exists "owner_select" on public.learning_settings;
create policy "owner_select" on public.learning_settings
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.learning_settings;
create policy "owner_insert" on public.learning_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.learning_settings;
create policy "owner_update" on public.learning_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.learning_settings;
create policy "owner_delete" on public.learning_settings
  for delete using (auth.uid() = user_id);
