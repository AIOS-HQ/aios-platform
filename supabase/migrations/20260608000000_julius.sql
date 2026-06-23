-- ============================================================================
-- AIOS Core — Julius: the AIOS organizational brain (company-scoped).
--
-- Julius is the shared AIOS organizational memory: objectives, decisions,
-- documents, activities, relationships, historical context, and knowledge that
-- every AIOS agent can read from / write to (where appropriate). Atlas is the
-- primary steward.
--
-- COMPANY-SCOPED (company_id) so each company's brain stays separate — AIOS and
-- AirBid memory never mix. Owner-private via RLS (single-owner platform pattern:
-- auth.uid() = user_id), matching companies/departments/agents.
--
-- Additive + idempotent. No existing tables are modified.
-- ============================================================================

do $$ begin
  create type public.julius_kind as enum (
    'objective',
    'decision',
    'document',
    'activity',
    'relationship',
    'historical',
    'context',
    'knowledge'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.julius_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Which AIOS workforce agent authored this entry (see src/lib/workforce).
  agent text not null default 'atlas',
  kind public.julius_kind not null default 'knowledge',
  title text not null,
  content text not null,
  -- Optional structured references (related objective/activity/document ids, etc.).
  refs jsonb not null default '{}'::jsonb,
  importance int not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists julius_entries_company_idx
  on public.julius_entries(user_id, company_id);
create index if not exists julius_entries_kind_idx
  on public.julius_entries(user_id, company_id, kind);
create index if not exists julius_entries_recent_idx
  on public.julius_entries(user_id, company_id, importance desc, created_at desc);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_julius_entries_updated_at on public.julius_entries;
create trigger set_julius_entries_updated_at before update on public.julius_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-private (single-owner platform). Company isolation
-- is enforced by company_id scoping in every query.
-- ---------------------------------------------------------------------------
alter table public.julius_entries enable row level security;

drop policy if exists "owner_select" on public.julius_entries;
create policy "owner_select" on public.julius_entries
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.julius_entries;
create policy "owner_insert" on public.julius_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.julius_entries;
create policy "owner_update" on public.julius_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.julius_entries;
create policy "owner_delete" on public.julius_entries
  for delete using (auth.uid() = user_id);
