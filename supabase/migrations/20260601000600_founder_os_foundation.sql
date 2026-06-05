-- ============================================================================
-- Founder Harmony (L3.5) — Owner Operating System foundation
-- Single-owner command center. Hierarchy:
--   Owner → Companies → { Departments → Agents · Objectives · Projects } → Work
-- Additive + idempotent. Every row is owner-scoped (auth.users) with RLS, the
-- same model as the personal_* tables. No multi-tenant / membership concepts.
-- ============================================================================

-- --- Enum types (guarded) ---------------------------------------------------
do $$ begin create type public.company_status as enum ('active','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.agent_status as enum ('active','paused'); exception when duplicate_object then null; end $$;
do $$ begin create type public.objective_status as enum ('active','paused','completed','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.project_status as enum ('planning','active','blocked','done','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.work_status as enum ('pending','in_progress','blocked','awaiting_approval','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_type as enum ('content','deployment','financial','integration','high_risk'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.activity_actor as enum ('founder','agent','department','system'); exception when duplicate_object then null; end $$;
do $$ begin create type public.activity_kind as enum ('agent_action','department_action','approval','objective','project','recommendation','system'); exception when duplicate_object then null; end $$;

-- --- companies --------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status public.company_status not null default 'active',
  color text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists companies_user_idx on public.companies(user_id, position);

-- --- departments (per company) ---------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  autonomy_level int not null default 1 check (autonomy_level between 0 and 3),
  status public.company_status not null default 'active',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists departments_user_idx on public.departments(user_id);
create index if not exists departments_company_idx on public.departments(company_id, position);

-- --- agents (per department) -----------------------------------------------
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  key text not null,
  name text not null,
  role text,
  status public.agent_status not null default 'active',
  autonomy_level int check (autonomy_level between 0 and 3),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agents_user_idx on public.agents(user_id);
create index if not exists agents_department_idx on public.agents(department_id, position);

-- --- objectives (per company, optional owning department) -------------------
create table if not exists public.objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  outcome text,
  status public.objective_status not null default 'active',
  progress int not null default 0 check (progress between 0 and 100),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists objectives_user_idx on public.objectives(user_id, status);
create index if not exists objectives_company_idx on public.objectives(company_id);

-- --- projects --------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  objective_id uuid references public.objectives(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  description text,
  status public.project_status not null default 'planning',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_company_idx on public.projects(company_id);
create index if not exists projects_objective_idx on public.projects(objective_id);

-- --- work_items (the work queue Harmony manages) ---------------------------
create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  objective_id uuid references public.objectives(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  title text not null,
  description text,
  status public.work_status not null default 'pending',
  priority public.task_priority not null default 'medium',
  position int not null default 0,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_items_user_idx on public.work_items(user_id, status);
create index if not exists work_items_company_idx on public.work_items(company_id, status);
create index if not exists work_items_department_idx on public.work_items(department_id);
create index if not exists work_items_project_idx on public.work_items(project_id);

-- --- approvals (Approval Center) -------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  work_item_id uuid references public.work_items(id) on delete set null,
  type public.approval_type not null,
  title text not null,
  summary text,
  status public.approval_status not null default 'pending',
  risk public.task_priority not null default 'medium',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists approvals_user_idx on public.approvals(user_id, status);
create index if not exists approvals_company_idx on public.approvals(company_id);

-- --- activity_events (append-only unified feed) ----------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  actor_type public.activity_actor not null default 'system',
  actor_id uuid,
  kind public.activity_kind not null,
  summary text not null,
  ref_type text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_idx on public.activity_events(user_id, created_at desc);
create index if not exists activity_company_idx on public.activity_events(company_id, created_at desc);

-- --- updated_at triggers (all except append-only activity_events) -----------
do $$
declare t text;
begin
  foreach t in array array['companies','departments','agents','objectives','projects','work_items','approvals']
  loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s;', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- --- Row Level Security — every row private to its owner --------------------
do $$
declare t text;
begin
  foreach t in array array['companies','departments','agents','objectives','projects','work_items','approvals','activity_events']
  loop
    execute format('alter table public.%I enable row level security;', t);
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
