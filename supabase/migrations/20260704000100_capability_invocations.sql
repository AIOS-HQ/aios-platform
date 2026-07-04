-- ============================================================================
-- AIOS — Capability Invocation Telemetry (Group B / Group C).
--
-- Persistent sink for the Universal Capability Runtime's TelemetryEvent
-- (src/lib/integrations/runtime/telemetry.ts). Append-only audit + usage
-- analytics of every capability execution: which connector/capability, outcome,
-- attempts, latency, correlation id. Column names mirror TelemetryEvent so the
-- sink maps 1:1 when wired (Group C, via setTelemetrySink).
--
-- APPLYING THIS IS BEHAVIOUR-NEUTRAL: it only provisions storage; the runtime's
-- default sink stays no-op until a sink is explicitly wired. Additive +
-- idempotent; no existing tables modified. Rows are owner-private via RLS and
-- expire after 90 days.
-- ============================================================================

create table if not exists public.capability_invocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  connector_id text not null,
  capability_id text not null,
  outcome text not null
    check (outcome in ('success', 'requires_approval', 'not_configured',
                       'not_connected', 'not_implemented', 'error')),
  attempts int not null default 0,
  duration_ms int not null default 0,
  correlation_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists capability_invocations_owner_idx
  on public.capability_invocations(user_id, created_at desc);
create index if not exists capability_invocations_capability_idx
  on public.capability_invocations(connector_id, capability_id, created_at desc);
create index if not exists capability_invocations_company_idx
  on public.capability_invocations(company_id, created_at desc);
create index if not exists capability_invocations_correlation_idx
  on public.capability_invocations(correlation_id);

-- ── Row Level Security — append-only, owner-private ──────────────────────────
-- Read your own telemetry; insert your own rows (or via the service role). No
-- update/delete for authenticated users, preserving audit integrity.
alter table public.capability_invocations enable row level security;

drop policy if exists "owner_select" on public.capability_invocations;
create policy "owner_select" on public.capability_invocations
  for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.capability_invocations;
create policy "owner_insert" on public.capability_invocations
  for insert with check (auth.uid() = user_id);

grant select, insert on table public.capability_invocations to authenticated;
