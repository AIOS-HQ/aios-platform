-- ============================================================================
-- AIOS Phase 2.1 — Company Context Envelope (Foundation 1) storage.
--
-- The envelope is the identity of every organization inside AIOS: the single
-- serializable object every AI worker derives behavior from (never hardcoded per
-- company). One row per company. Structured identity columns + jsonb sections
-- (typed at the app layer) so the envelope can evolve without a schema change;
-- `schema_version` guards forward-compatibility.
--
-- SECURITY: contains configuration only — NO secrets/tokens. Connector bindings
-- store which providers + scopes, never credentials (tokens live encrypted in
-- integration_connections). Every row is owner-private via RLS.
--
-- APPLYING THIS IS BEHAVIOUR-NEUTRAL: it only provisions storage; no runtime
-- path is wired or changed. Additive + idempotent; no existing tables modified.
-- ============================================================================

create table if not exists public.company_context_envelope (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version int not null default 1,
  -- Identity
  company_name text,
  industry text,
  brand jsonb not null default '{}'::jsonb,
  -- Behavior-shaping sections (typed at the application layer)
  objectives jsonb not null default '[]'::jsonb,
  departments jsonb not null default '[]'::jsonb,
  policies jsonb not null default '{}'::jsonb,
  governance jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '[]'::jsonb,
  workforce jsonb not null default '[]'::jsonb,
  connectors jsonb not null default '[]'::jsonb,          -- config only; NO tokens
  skills jsonb not null default '[]'::jsonb,
  knowledge_ref text,                                     -- Julius namespace handle
  founder_preferences jsonb not null default '{}'::jsonb,
  security_profile jsonb not null default '{}'::jsonb,
  operating_rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_context_envelope_owner_idx
  on public.company_context_envelope(user_id);

drop trigger if exists set_company_context_envelope_updated_at on public.company_context_envelope;
create trigger set_company_context_envelope_updated_at
  before update on public.company_context_envelope
  for each row execute function public.set_updated_at();

-- ── Row Level Security — envelope is owner (founder) private ─────────────────
alter table public.company_context_envelope enable row level security;

drop policy if exists "owner_select" on public.company_context_envelope;
create policy "owner_select" on public.company_context_envelope
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.company_context_envelope;
create policy "owner_insert" on public.company_context_envelope
  for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.company_context_envelope;
create policy "owner_update" on public.company_context_envelope
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_delete" on public.company_context_envelope;
create policy "owner_delete" on public.company_context_envelope
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.company_context_envelope to authenticated;
