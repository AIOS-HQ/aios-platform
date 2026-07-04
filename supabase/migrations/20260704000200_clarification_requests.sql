-- ============================================================================
-- AIOS Phase 2.1 — Clarification Persistence (Foundation 2).
--
-- Persistent store for the Universal Clarification Engine
-- (src/lib/ai/clarification/). Holds a worker's pending/resolved clarification
-- requests so a paused work item can resume after the user answers — the same
-- resumable-work-item pattern as the Execution Spine. Column names mirror
-- ClarificationRequest so the persistent ClarificationStore maps 1:1 when wired.
--
-- APPLYING THIS IS BEHAVIOUR-NEUTRAL: it only provisions storage; the engine's
-- default store stays in-memory until a persistent store is wired
-- (setClarificationStore). Additive + idempotent; no existing tables modified.
-- Every row is owner-private via RLS.
-- ============================================================================

create table if not exists public.clarification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  worker text not null,
  work_item_id text,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists clarification_requests_owner_idx
  on public.clarification_requests(user_id, status, created_at desc);
create index if not exists clarification_requests_work_item_idx
  on public.clarification_requests(work_item_id);
create index if not exists clarification_requests_company_idx
  on public.clarification_requests(company_id, status);

-- ── Row Level Security — owner-private full CRUD (user answers their own) ─────
alter table public.clarification_requests enable row level security;

drop policy if exists "owner_select" on public.clarification_requests;
create policy "owner_select" on public.clarification_requests
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.clarification_requests;
create policy "owner_insert" on public.clarification_requests
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.clarification_requests;
create policy "owner_update" on public.clarification_requests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.clarification_requests;
create policy "owner_delete" on public.clarification_requests
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.clarification_requests to authenticated;
