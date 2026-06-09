-- ============================================================================
-- AIOS Core — Harmony Function Calling / Tool Execution (AI Agent Stack, PR 2)
--
-- An owner-private audit log for every tool/action Harmony executes on a user's
-- behalf. This is the backbone of the function-calling layer: each action is
-- recorded, optionally held for human approval, then executed and its result
-- (or error) captured. Nothing here auto-runs — execution is driven by the
-- application/assistant and is always owner-scoped.
--
-- Additive + idempotent. Owner-private via RLS. No existing tables are modified.
-- ============================================================================

do $$ begin
  create type public.agent_action_status as enum (
    'pending',
    'approved',
    'rejected',
    'executed',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Registered tool name (see src/lib/agent/tools/registry.ts).
  tool text not null,
  -- Arguments passed to the tool.
  params jsonb not null default '{}'::jsonb,
  status public.agent_action_status not null default 'pending',
  -- Whether this action needed (or needs) human approval before running.
  requires_approval boolean not null default true,
  -- Tool output on success.
  result jsonb,
  -- Error detail on failure.
  error text,
  -- Who/what requested the action (e.g. 'harmony','manual','workflow').
  source text not null default 'harmony',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz
);
create index if not exists agent_actions_user_idx on public.agent_actions(user_id);
create index if not exists agent_actions_user_status_idx
  on public.agent_actions(user_id, status);
create index if not exists agent_actions_user_recent_idx
  on public.agent_actions(user_id, created_at desc);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_agent_actions_updated_at on public.agent_actions;
create trigger set_agent_actions_updated_at before update on public.agent_actions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — every action is private to its owner (full CRUD).
-- ---------------------------------------------------------------------------
alter table public.agent_actions enable row level security;

drop policy if exists "owner_select" on public.agent_actions;
create policy "owner_select" on public.agent_actions
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.agent_actions;
create policy "owner_insert" on public.agent_actions
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.agent_actions;
create policy "owner_update" on public.agent_actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.agent_actions;
create policy "owner_delete" on public.agent_actions
  for delete using (auth.uid() = user_id);
