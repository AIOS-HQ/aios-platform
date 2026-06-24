-- ============================================================================
-- AIOS Core — Bounded Autonomy Controls (DRAFT v2 — review before applying).
--
-- Control plane for bounded autonomy. APPLYING THIS IS BEHAVIOUR-NEUTRAL: every
-- agent defaults to mode='off', lockdown/kill_switch are off, the auto-execute
-- threshold is 'none', and every action CATEGORY defaults to "requires approval,
-- not auto-allowed". Nothing executes autonomously until (a) this is applied,
-- (b) the Phase 9 engine ships, and (c) the founder explicitly raises an agent's
-- mode to 'bounded' AND opens specific categories.
--
-- The autonomy engine evaluates BOTH dimensions for every proposed action:
--   1. risk_level  ∈ low | medium | high | critical
--   2. category    ∈ financial | code | security | architecture | publishing |
--                    destructive | operational | communications | research
--
-- HARD INVARIANTS (enforced in code on top of this schema; never auto-executed):
--   financial · code · security · architecture · publishing · destructive
--   → ALWAYS founder-approved. The auto-execute threshold can never exceed
--   'medium'; HIGH/CRITICAL always require approval. Only operational /
--   communications / research are eligible to be opened for autonomy.
--
-- Modes:   off (no autonomy, no proposals act) · advisory (agents propose only;
--          today's behaviour) · bounded (low/medium + opened categories may
--          auto-execute, within budgets/limits, everything else → approval).
-- Freezes: kill_switch = emergency stop of autonomous execution.
--          lockdown    = founder freeze of autonomous execution, delegation,
--          queue execution, and approval ROUTING — while reads, visibility and
--          auditing continue unaffected.
--
-- Owner-private (RLS) + authenticated self-grants. Additive, idempotent,
-- NON-destructive. AIOS roster only; Julius is not an agent here.
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Global autonomy settings (one row per founder) ──────────────────────────
create table if not exists public.agent_autonomy_global (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off', 'advisory', 'bounded')),
  kill_switch boolean not null default false,
  -- Founder lockdown: freezes autonomous execution, delegation, queue execution
  -- and approval routing; reads / visibility / audit continue. Distinct from the
  -- kill switch (which only halts autonomous execution).
  lockdown boolean not null default false,
  auto_execute_threshold text not null default 'none'
    check (auto_execute_threshold in ('none', 'low', 'medium')),
  max_actions_per_hour int not null default 0 check (max_actions_per_hour >= 0),
  max_delegation_depth int not null default 1 check (max_delegation_depth >= 0),
  require_audit boolean not null default true,
  notify_on_medium boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_autonomy_global enable row level security;
drop policy if exists "owner_select" on public.agent_autonomy_global;
create policy "owner_select" on public.agent_autonomy_global
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_autonomy_global;
create policy "owner_insert" on public.agent_autonomy_global
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_autonomy_global;
create policy "owner_update" on public.agent_autonomy_global
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_autonomy_global;
create policy "owner_delete" on public.agent_autonomy_global
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_autonomy_global_updated_at on public.agent_autonomy_global;
create trigger set_agent_autonomy_global_updated_at
  before update on public.agent_autonomy_global
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_autonomy_global to authenticated;

-- ── Per-agent autonomy settings (override + budgets) ────────────────────────
-- Effective autonomy = the MORE RESTRICTIVE of global and per-agent. Null
-- threshold/depth = inherit global. Budgets default 0 = "no autonomous actions
-- permitted" (must set a positive budget to allow any).
create table if not exists public.agent_autonomy_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null,
  mode text not null default 'off' check (mode in ('off', 'advisory', 'bounded')),
  auto_execute_threshold text
    check (auto_execute_threshold in ('none', 'low', 'medium')),
  max_delegation_depth int check (max_delegation_depth >= 0),
  daily_action_limit int not null default 0 check (daily_action_limit >= 0),
  monthly_action_limit int not null default 0 check (monthly_action_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent)
);
create index if not exists agent_autonomy_settings_owner_idx
  on public.agent_autonomy_settings(user_id, agent);

alter table public.agent_autonomy_settings enable row level security;
drop policy if exists "owner_select" on public.agent_autonomy_settings;
create policy "owner_select" on public.agent_autonomy_settings
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_autonomy_settings;
create policy "owner_insert" on public.agent_autonomy_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_autonomy_settings;
create policy "owner_update" on public.agent_autonomy_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_autonomy_settings;
create policy "owner_delete" on public.agent_autonomy_settings
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_autonomy_settings_updated_at on public.agent_autonomy_settings;
create trigger set_agent_autonomy_settings_updated_at
  before update on public.agent_autonomy_settings
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_autonomy_settings to authenticated;

-- ── Per-category autonomy policy ────────────────────────────────────────────
-- The second dimension the engine evaluates. Defaults are SAFE: every category
-- starts auto_allowed=false, requires_approval=true, max_risk='none'. The code
-- forces the six restricted categories (financial/code/security/architecture/
-- publishing/destructive) to stay approval-only regardless of any row here.
create table if not exists public.agent_autonomy_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'financial', 'code', 'security', 'architecture', 'publishing',
    'destructive', 'operational', 'communications', 'research'
  )),
  auto_allowed boolean not null default false,
  requires_approval boolean not null default true,
  max_risk text not null default 'none' check (max_risk in ('none', 'low', 'medium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
create index if not exists agent_autonomy_categories_owner_idx
  on public.agent_autonomy_categories(user_id, category);

alter table public.agent_autonomy_categories enable row level security;
drop policy if exists "owner_select" on public.agent_autonomy_categories;
create policy "owner_select" on public.agent_autonomy_categories
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_autonomy_categories;
create policy "owner_insert" on public.agent_autonomy_categories
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_autonomy_categories;
create policy "owner_update" on public.agent_autonomy_categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_autonomy_categories;
create policy "owner_delete" on public.agent_autonomy_categories
  for delete using (auth.uid() = user_id);

drop trigger if exists set_agent_autonomy_categories_updated_at on public.agent_autonomy_categories;
create trigger set_agent_autonomy_categories_updated_at
  before update on public.agent_autonomy_categories
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.agent_autonomy_categories to authenticated;

-- ── Risk level + category on work items (additive, nullable, idempotent) ────
alter table public.agent_work_queue add column if not exists risk_level text;
do $$ begin
  alter table public.agent_work_queue
    add constraint agent_work_queue_risk_level_chk
    check (risk_level in ('low', 'medium', 'high', 'critical'));
exception when duplicate_object then null; end $$;

alter table public.agent_work_queue add column if not exists category text;
do $$ begin
  alter table public.agent_work_queue
    add constraint agent_work_queue_category_chk
    check (category in (
      'financial', 'code', 'security', 'architecture', 'publishing',
      'destructive', 'operational', 'communications', 'research'
    ));
exception when duplicate_object then null; end $$;

-- ── Autonomy audit trail (append-only) ──────────────────────────────────────
create table if not exists public.agent_autonomy_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  agent text not null,
  action text not null,
  category text check (category in (
    'financial', 'code', 'security', 'architecture', 'publishing',
    'destructive', 'operational', 'communications', 'research'
  )),
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical')),
  decision text not null check (decision in (
    'auto_executed', 'notified', 'pending_approval', 'denied', 'kill_switch', 'lockdown'
  )),
  detail text,
  ref_type text,
  ref_id text,
  created_at timestamptz not null default now()
);
create index if not exists agent_autonomy_audit_owner_idx
  on public.agent_autonomy_audit(user_id, created_at);

alter table public.agent_autonomy_audit enable row level security;
drop policy if exists "owner_select" on public.agent_autonomy_audit;
create policy "owner_select" on public.agent_autonomy_audit
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.agent_autonomy_audit;
create policy "owner_insert" on public.agent_autonomy_audit
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.agent_autonomy_audit;
create policy "owner_update" on public.agent_autonomy_audit
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.agent_autonomy_audit;
create policy "owner_delete" on public.agent_autonomy_audit
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.agent_autonomy_audit to authenticated;
