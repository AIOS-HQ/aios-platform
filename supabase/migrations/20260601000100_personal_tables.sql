-- ============================================================================
-- AIOS Core — 0002: Harmony personal data
-- tasks, goals, notes, personal brain (future AI memory layer)
-- ============================================================================

do $$ begin create type public.task_status as enum ('todo','in_progress','done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_priority as enum ('low','medium','high'); exception when duplicate_object then null; end $$;
do $$ begin create type public.goal_status as enum ('active','paused','completed','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.brain_kind as enum ('note','preference','goal','manual'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- personal_tasks
-- ---------------------------------------------------------------------------
create table if not exists public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_tasks_user_idx on public.personal_tasks(user_id);
create index if not exists personal_tasks_due_idx on public.personal_tasks(user_id, due_date);

-- ---------------------------------------------------------------------------
-- personal_goals
-- ---------------------------------------------------------------------------
create table if not exists public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status public.goal_status not null default 'active',
  progress int not null default 0 check (progress between 0 and 100),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_goals_user_idx on public.personal_goals(user_id);

-- ---------------------------------------------------------------------------
-- personal_notes
-- ---------------------------------------------------------------------------
create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_notes_user_idx on public.personal_notes(user_id);

-- ---------------------------------------------------------------------------
-- personal_brains — the Personal Brain store.
-- Designed as the future AI memory layer. Embeddings/vector search are NOT
-- built yet (see docs/PERSONAL_BRAIN.md for the pgvector plan).
-- ---------------------------------------------------------------------------
create table if not exists public.personal_brains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  kind public.brain_kind not null default 'manual',
  source_id uuid,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_brains_user_idx on public.personal_brains(user_id);
create index if not exists personal_brains_kind_idx on public.personal_brains(user_id, kind);

-- updated_at triggers
drop trigger if exists set_personal_tasks_updated_at on public.personal_tasks;
create trigger set_personal_tasks_updated_at before update on public.personal_tasks for each row execute function public.set_updated_at();
drop trigger if exists set_personal_goals_updated_at on public.personal_goals;
create trigger set_personal_goals_updated_at before update on public.personal_goals for each row execute function public.set_updated_at();
drop trigger if exists set_personal_notes_updated_at on public.personal_notes;
create trigger set_personal_notes_updated_at before update on public.personal_notes for each row execute function public.set_updated_at();
drop trigger if exists set_personal_brains_updated_at on public.personal_brains;
create trigger set_personal_brains_updated_at before update on public.personal_brains for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — every row is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.personal_tasks enable row level security;
alter table public.personal_goals enable row level security;
alter table public.personal_notes enable row level security;
alter table public.personal_brains enable row level security;

do $$
declare t text;
begin
  foreach t in array array['personal_tasks','personal_goals','personal_notes','personal_brains']
  loop
    execute format('drop policy if exists "owner_select" on public.%I;', t);
    execute format('create policy "owner_select" on public.%I for select using (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_insert" on public.%I;', t);
    execute format('create policy "owner_insert" on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_update" on public.%I;', t);
    execute format('create policy "owner_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists "owner_delete" on public.%I;', t);
    execute format('create policy "owner_delete" on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;
