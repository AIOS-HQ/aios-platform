-- ============================================================================
-- Founder OS — autonomy 0..4 + life/business domains.
-- Additive + idempotent. Applied manually via the Supabase SQL editor.
--   * Autonomy levels widen from 0..3 to 0..4
--     (Manual / Assistant / Coordinator / Operator / Executive).
--   * Companies gain a `domain` (household | personal | business).
-- ============================================================================

-- Autonomy: widen the CHECK constraint to 0..4 on departments + agents.
alter table public.departments drop constraint if exists departments_autonomy_level_check;
alter table public.departments add constraint departments_autonomy_level_check check (autonomy_level between 0 and 4);
alter table public.agents drop constraint if exists agents_autonomy_level_check;
alter table public.agents add constraint agents_autonomy_level_check check (autonomy_level between 0 and 4);

-- Domains: Household / Personal / Business (companies carry a domain).
do $$ begin create type public.company_domain as enum ('household','personal','business'); exception when duplicate_object then null; end $$;
alter table public.companies add column if not exists domain public.company_domain not null default 'business';
create index if not exists companies_domain_idx on public.companies(user_id, domain, position);
