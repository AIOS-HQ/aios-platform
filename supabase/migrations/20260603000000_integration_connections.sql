-- ============================================================================
-- AIOS Core — Integration connections (framework preparation, PR #7)
-- Records a user's connected third-party integrations (OpenAI, Google Calendar,
-- Gmail, YouTube, LinkedIn, TikTok, ...).
--
-- Rows are READ by their owner via RLS (token columns are never selected for
-- the client); they are WRITTEN only by the service-role client from the OAuth
-- callback. Additive + idempotent; no existing tables are modified.
-- ============================================================================

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  scopes text,
  external_account text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists integration_connections_user_idx
  on public.integration_connections(user_id);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_integration_connections_updated_at on public.integration_connections;
create trigger set_integration_connections_updated_at before update on public.integration_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner may READ; all writes go through the service role.
-- (The data layer never selects token columns for client-reachable reads.)
-- ---------------------------------------------------------------------------
alter table public.integration_connections enable row level security;

drop policy if exists "owner_select" on public.integration_connections;
create policy "owner_select" on public.integration_connections
  for select using (auth.uid() = user_id);
