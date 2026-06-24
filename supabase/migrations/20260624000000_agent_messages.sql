-- ============================================================================
-- AIOS Core — Agent-to-Agent communication (company-scoped).
--
-- Real collaboration substrate between AIOS workforce agents: messages, task
-- delegation, and responses. Each row records who (from_agent) asked whom
-- (to_agent) to do what, the governance risk class, the Julius context attached
-- at send time, and the outcome written back on completion.
--
-- COMPANY-SCOPED (company_id) so AIOS and AirBid never mix; Julius stays the
-- AIOS-only brain referenced via context/outcome. Owner-private via RLS
-- (single-owner platform pattern: auth.uid() = user_id), matching julius_entries.
--
-- Risky/write delegations are gated through the existing approvals table via a
-- new approvals.agent_message_id link (founder stays in the loop).
--
-- Additive + idempotent. No existing tables are dropped or altered destructively.
-- ============================================================================

do $$ begin
  create type public.agent_message_kind as enum ('message', 'task', 'response');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agent_message_status as enum (
    'open',
    'delegated',
    'in_progress',
    'completed',
    'blocked',
    'awaiting_approval'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agent_message_risk as enum ('routine', 'approval', 'destructive');
exception when duplicate_object then null; end $$;

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- AIOS workforce agent keys (see src/lib/workforce/registry.ts).
  from_agent text not null,
  to_agent text not null,
  kind public.agent_message_kind not null default 'message',
  status public.agent_message_status not null default 'open',
  risk public.agent_message_risk not null default 'routine',
  -- Threads a response / follow-up back to the originating task or message.
  parent_id uuid references public.agent_messages(id) on delete cascade,
  subject text not null,
  body text not null default '',
  -- Julius context attached at send time (entry ids/titles snapshot).
  context jsonb not null default '{}'::jsonb,
  -- Outcome written by the responding agent (also persisted to Julius).
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_messages_company_idx
  on public.agent_messages(user_id, company_id);
create index if not exists agent_messages_thread_idx
  on public.agent_messages(user_id, parent_id);
create index if not exists agent_messages_recent_idx
  on public.agent_messages(user_id, company_id, created_at desc);
create index if not exists agent_messages_inbox_idx
  on public.agent_messages(user_id, company_id, to_agent, status);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_agent_messages_updated_at on public.agent_messages;
create trigger set_agent_messages_updated_at before update on public.agent_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-private (single-owner platform). Company isolation
-- is enforced by company_id scoping in every query.
-- ---------------------------------------------------------------------------
alter table public.agent_messages enable row level security;

drop policy if exists "owner_select" on public.agent_messages;
create policy "owner_select" on public.agent_messages
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.agent_messages;
create policy "owner_insert" on public.agent_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.agent_messages;
create policy "owner_update" on public.agent_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.agent_messages;
create policy "owner_delete" on public.agent_messages
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Governance link: an approval can gate a risky/write agent-to-agent delegation
-- (mirrors approvals.message_id / approvals.work_item_id). Nullable + additive.
-- ---------------------------------------------------------------------------
alter table public.approvals
  add column if not exists agent_message_id uuid references public.agent_messages(id) on delete set null;
