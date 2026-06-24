-- ============================================================================
-- AIOS Core — Per-agent chat history (founder ↔ AIOS workforce member).
--
-- Persistent, company-scoped, owner-private chat transcripts for each AIOS agent
-- (Harmony, Auditor, Catalyst, Ambassador, Atlas, Pulse, Horizon, Aegis, Ledger).
-- Julius stays the AIOS-only Company Brain (read for context, not chatted with).
--
-- Owner-private via RLS; includes its OWN authenticated grant (tables created
-- after the grant-all backstop must grant themselves). Additive + idempotent.
-- ============================================================================

do $$ begin
  create type public.chat_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

create table if not exists public.agent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  -- AIOS workforce agent key (see src/lib/workforce/registry.ts).
  agent text not null,
  role public.chat_role not null,
  content text not null,
  -- Julius entry ids/titles referenced when composing the turn.
  refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_chat_messages_thread_idx
  on public.agent_chat_messages(user_id, agent, created_at);

alter table public.agent_chat_messages enable row level security;

drop policy if exists "owner_select" on public.agent_chat_messages;
create policy "owner_select" on public.agent_chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.agent_chat_messages;
create policy "owner_insert" on public.agent_chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.agent_chat_messages;
create policy "owner_update" on public.agent_chat_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.agent_chat_messages;
create policy "owner_delete" on public.agent_chat_messages
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.agent_chat_messages to authenticated;
