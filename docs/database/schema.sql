-- ============================================================================
-- AIOS Core — Consolidated schema (paste-ready)
--
-- This is the SAME schema as supabase/migrations/*, concatenated for users who
-- prefer to paste into the Supabase Dashboard SQL Editor instead of using the
-- Supabase CLI. Safe to re-run (idempotent). See docs/DATABASE.md.
-- ============================================================================

-- ============================================================================
-- AIOS Core — 0001: profiles, roles, settings
-- Identity layer shared by all AIOS products.
-- ============================================================================

create extension if not exists pgcrypto;

-- Role enum: personal_user | business_owner | admin
do $$ begin
  create type public.user_role as enum ('personal_user', 'business_owner', 'admin');
exception when duplicate_object then null; end $$;

-- Generic updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'personal_user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'en',
  timezone text not null default 'UTC',
  theme text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin check — SECURITY DEFINER avoids RLS recursion on profiles.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- On signup: create the profile + settings rows automatically.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, preferred_language)
  values (new.id, coalesce(new.raw_user_meta_data->>'preferred_language', 'en'))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: non-admins cannot escalate their own role.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;  -- silently ignore role changes by non-admins
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "profiles_select_owner_or_admin" on public.profiles;
create policy "profiles_select_owner_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


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
