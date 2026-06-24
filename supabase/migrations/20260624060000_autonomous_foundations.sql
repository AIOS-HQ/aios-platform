-- ============================================================================
-- AIOS Core — Autonomous Workforce Foundations (advisory-default).
--
-- Structured data for agent objectives, a proposed work queue, and agent
-- recommendations. This migration is intentionally BEHAVIOR-NEUTRAL: every
-- row defaults to human-in-the-loop (work_queue.autonomy = 'advisory',
-- requires_approval = true, statuses start at 'proposed'/'open'). Nothing
-- executes autonomously — there is no code path that drains the queue, and
-- risky/write actions continue to route through the existing Approval Center
-- (approvals.agent_message_id). Bounded autonomy (auto-exec of routine items)
-- remains a deliberate, separate decision; the schema is forward-compatible
-- with it (the `autonomy` column) but does not enable it.
--
-- AIOS roster only (agent = AiosAgentKey string). Julius stays the Company
-- Brain and is NOT an agent here. Owner-private via RLS; each table includes
-- its OWN authenticated grant. Additive, idempotent, NON-destructive.
-- ============================================================================

-- Reusable updated_at trigger (create-or-replace = safe if it already exists).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Agent objectives ───────────────────────────────────────────────────────
-- What each workforce member is working toward. `origin` records whether the
-- founder set it or the agent proposed it; agent-proposed objectives start as
-- 'proposed' and the founder promotes them to 'active'.
create table if not exists public.agent_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  agent text not null,
  title text not null,
  detail text,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'paused', 'done', 'dismissed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  origin text not null default 'agent'
    check (origin in ('agent', 'founder')),
  progress int not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_objectives_owner_idx
  on public.agent_objectives(user_id, status, agent);

alter table public.agent_objectives enable row level security;

drop policy if exists "owner_select" on public.agent_objectives;
create policy "owner_select" on public.agent_objectives
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_objectives;
create policy "owner_insert" on public.agent_objectives
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_objectives;
create policy "owner_update" on public.agent_objectives
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_objectives;
create policy "owner_delete" on public.agent_objectives
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_objectives_updated_at on public.agent_objectives;
create trigger set_agent_objectives_updated_at
  before update on public.agent_objectives
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_objectives to authenticated;

-- ── Agent work queue ───────────────────────────────────────────────────────
-- Proposed units of work. `autonomy` defaults to 'advisory' (needs founder
-- action) and `requires_approval` defaults to true, so applying this migration
-- enables NO autonomous execution. `risk` mirrors the A2A vocabulary so risky
-- items route through the Approval Center exactly as agent_messages do today.
create table if not exists public.agent_work_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  agent text not null,
  objective_id uuid references public.agent_objectives(id) on delete set null,
  title text not null,
  detail text,
  kind text not null default 'task'
    check (kind in ('task', 'message', 'review')),
  risk text not null default 'routine'
    check (risk in ('routine', 'approval', 'destructive')),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'in_progress', 'done', 'blocked', 'dismissed')),
  autonomy text not null default 'advisory'
    check (autonomy in ('advisory', 'auto')),
  requires_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_work_queue_owner_idx
  on public.agent_work_queue(user_id, status, agent);

alter table public.agent_work_queue enable row level security;

drop policy if exists "owner_select" on public.agent_work_queue;
create policy "owner_select" on public.agent_work_queue
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_work_queue;
create policy "owner_insert" on public.agent_work_queue
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_work_queue;
create policy "owner_update" on public.agent_work_queue
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_work_queue;
create policy "owner_delete" on public.agent_work_queue
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_work_queue_updated_at on public.agent_work_queue;
create trigger set_agent_work_queue_updated_at
  before update on public.agent_work_queue
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_work_queue to authenticated;

-- ── Agent recommendations ──────────────────────────────────────────────────
-- Advisory suggestions surfaced for the founder (accept / dismiss), in the
-- spirit of the existing suggested-learnings flow. Never acted on automatically.
create table if not exists public.agent_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  agent text not null,
  title text not null,
  detail text,
  rationale text,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_recommendations_owner_idx
  on public.agent_recommendations(user_id, status, agent);

alter table public.agent_recommendations enable row level security;

drop policy if exists "owner_select" on public.agent_recommendations;
create policy "owner_select" on public.agent_recommendations
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_recommendations;
create policy "owner_insert" on public.agent_recommendations
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_recommendations;
create policy "owner_update" on public.agent_recommendations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_recommendations;
create policy "owner_delete" on public.agent_recommendations
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_recommendations_updated_at on public.agent_recommendations;
create trigger set_agent_recommendations_updated_at
  before update on public.agent_recommendations
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_recommendations to authenticated;
