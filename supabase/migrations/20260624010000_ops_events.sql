-- ============================================================================
-- AIOS Core — Operational events (observability backbone).
--
-- Structured production-visibility log for autonomous execution: errors, action
-- failures, connector failures, agent execution issues, and dropped audit
-- writes. Distinct from activity_events (the human-facing feed) — ops_events is
-- the operational/error channel the Founder Command Center surfaces and the
-- founder can resolve.
--
-- Owner-private via RLS (single-owner platform pattern). company_id optional
-- (some failures are not company-scoped). Additive + idempotent + non-destructive.
-- ============================================================================

do $$ begin
  create type public.ops_level as enum ('info', 'warn', 'error');
exception when duplicate_object then null; end $$;

create table if not exists public.ops_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  level public.ops_level not null default 'info',
  -- Origin, e.g. 'execution', 'comms/linkedin', 'a2a', 'connector/github', 'activity'.
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  -- Failed autonomous actions stay unresolved until the founder acknowledges them.
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ops_events_recent_idx
  on public.ops_events(user_id, created_at desc);
create index if not exists ops_events_unresolved_idx
  on public.ops_events(user_id, resolved, level, created_at desc);

alter table public.ops_events enable row level security;

drop policy if exists "owner_select" on public.ops_events;
create policy "owner_select" on public.ops_events
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.ops_events;
create policy "owner_insert" on public.ops_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.ops_events;
create policy "owner_update" on public.ops_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.ops_events;
create policy "owner_delete" on public.ops_events
  for delete using (auth.uid() = user_id);
