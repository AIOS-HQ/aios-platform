-- ============================================================================
-- AIOS Core — Unified Autonomy Policy Engine persistence.
--
-- Creates the three tables the merged policy engine (PR #282,
-- src/lib/harmony/autonomy/data-access.ts) already expects but that do not yet
-- exist on main:
--   • founder_directives — Founder-granted permissions per agent/domain/action
--   • approval_payloads   — paused executions awaiting Founder approval
--   • execution_results   — autonomy execution audit trail
--
-- Column names/types mirror data-access.ts exactly so the engine's queries work
-- unchanged. APPLYING THIS IS BEHAVIOUR-NEUTRAL: it only provisions storage — no
-- runtime path is wired or changed by this migration. Every row is owner-private
-- via RLS (auth.uid() = user_id), the same model as the personal_*, founder OS,
-- and agent_autonomy_* tables. Additive + idempotent; no existing tables are
-- modified.
-- ============================================================================

-- ── founder_directives — explicit Founder permissions ───────────────────────
create table if not exists public.founder_directives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  founder_id uuid not null references auth.users(id) on delete cascade,
  agent text not null,
  domain text not null,
  allowed_actions text[] not null default '{}',
  denied_actions text[] not null default '{}',
  max_concurrent_actions int,
  rate_limit_per_minute int,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  delegated_to_approver text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists founder_directives_owner_idx
  on public.founder_directives(user_id);
create index if not exists founder_directives_lookup_idx
  on public.founder_directives(user_id, agent, domain, status);

drop trigger if exists set_founder_directives_updated_at on public.founder_directives;
create trigger set_founder_directives_updated_at
  before update on public.founder_directives
  for each row execute function public.set_updated_at();

-- ── approval_payloads — paused executions awaiting Founder approval ──────────
create table if not exists public.approval_payloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  approval_id text not null unique,
  original_actor text not null,
  original_agent text not null,
  original_domain text not null,
  original_action text not null,
  original_params jsonb not null default '{}'::jsonb,
  required_context jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  founder_approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours')
);
create index if not exists approval_payloads_owner_idx
  on public.approval_payloads(user_id, status, created_at desc);
create index if not exists approval_payloads_company_idx
  on public.approval_payloads(company_id, status);

-- ── execution_results — autonomy execution audit trail ──────────────────────
create table if not exists public.execution_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  execution_id text not null unique,
  agent text not null,
  domain text not null,
  action text not null,
  status text not null
    check (status in ('completed', 'pending_approval', 'blocked', 'failed')),
  required_approval boolean not null default false,
  approval_id text,
  founder_approved_at timestamptz,
  completed_at timestamptz,
  result_data jsonb,
  error jsonb,
  emitted_to text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
create index if not exists execution_results_owner_idx
  on public.execution_results(user_id, created_at desc);
create index if not exists execution_results_company_idx
  on public.execution_results(company_id, created_at desc);

-- ── Row Level Security — every row private to its owner + self-grants ────────
do $$
declare t text;
begin
  foreach t in array array['founder_directives', 'approval_payloads', 'execution_results']
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
    execute format('grant select, insert, update, delete on table public.%I to authenticated;', t);
  end loop;
end $$;
