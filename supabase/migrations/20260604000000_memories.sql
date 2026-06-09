-- ============================================================================
-- AIOS Core — Harmony Memory Engine (AI Agent Stack: Memory/RAG, PR 1)
--
-- An OS-wide memory store so Harmony can remember + retrieve user preferences,
-- completed tasks, approvals, decisions, conversations, department activity,
-- workflow outcomes, and recurring patterns. Complements (does not replace) the
-- personal_brains notes layer.
--
-- Additive + idempotent. Owner-private via RLS. No existing tables are modified.
-- No vector/pgvector dependency (retrieval is importance + recency + keyword).
-- ============================================================================

do $$ begin
  create type public.memory_kind as enum (
    'preference',
    'task',
    'approval',
    'decision',
    'conversation',
    'department_activity',
    'workflow_outcome',
    'pattern'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.memory_kind not null default 'preference',
  content text not null,
  -- Where this memory came from (e.g. 'manual','system','task','approval').
  source text not null default 'manual',
  -- Optional id of the originating entity (task id, approval id, ...).
  source_id text,
  -- Relevance weight 1 (low) .. 5 (high); set by the importance scorer.
  importance int not null default 3 check (importance between 1 and 5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_idx on public.memories(user_id);
create index if not exists memories_user_kind_idx on public.memories(user_id, kind);
create index if not exists memories_user_rank_idx
  on public.memories(user_id, importance desc, created_at desc);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_memories_updated_at on public.memories;
create trigger set_memories_updated_at before update on public.memories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — every memory is private to its owner (full CRUD).
-- ---------------------------------------------------------------------------
alter table public.memories enable row level security;

drop policy if exists "owner_select" on public.memories;
create policy "owner_select" on public.memories
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.memories;
create policy "owner_insert" on public.memories
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update" on public.memories;
create policy "owner_update" on public.memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_delete" on public.memories;
create policy "owner_delete" on public.memories
  for delete using (auth.uid() = user_id);
