create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  external_account_id text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_id)
);

alter table public.integration_connections enable row level security;

create policy "Users can view own integration connections"
on public.integration_connections
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own integration connections"
on public.integration_connections
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own integration connections"
on public.integration_connections
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own integration connections"
on public.integration_connections
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists integration_connections_user_provider_idx
on public.integration_connections(user_id, provider_id);
