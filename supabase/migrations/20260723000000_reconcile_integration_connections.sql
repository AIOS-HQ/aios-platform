-- Canonical integration connection contract and grant repair.
--
-- Application fields are provider/scopes/external_account. The later
-- provider_id/scope/external_account_id fields remain synchronized compatibility
-- mirrors so no existing data is discarded. Conflicting populated values fail
-- closed instead of being overwritten.

create extension if not exists pgcrypto;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text,
  provider_id text,
  status text not null default 'connected',
  scopes text,
  scope text,
  external_account text,
  external_account_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_connections
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists provider text,
  add column if not exists provider_id text,
  add column if not exists status text default 'connected',
  add column if not exists scopes text,
  add column if not exists scope text,
  add column if not exists external_account text,
  add column if not exists external_account_id text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists connected_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
declare
  expected_column_name text;
begin
  foreach expected_column_name in array array[
    'provider', 'provider_id', 'status', 'scopes', 'scope',
    'external_account', 'external_account_id', 'access_token', 'refresh_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'integration_connections'
        and c.column_name = expected_column_name
        and data_type not in ('text', 'character varying')
    ) then
      raise exception using message = 'integration_connections_incompatible_column_type_' || expected_column_name;
    end if;
  end loop;

  if exists (
    select 1 from public.integration_connections
    where provider is not null and provider_id is not null and provider <> provider_id
  ) then
    raise exception using message = 'integration_connections_conflicting_provider_values';
  end if;
  if exists (
    select 1 from public.integration_connections
    where scopes is not null and scope is not null and scopes <> scope
  ) then
    raise exception using message = 'integration_connections_conflicting_scope_values';
  end if;
  if exists (
    select 1 from public.integration_connections
    where external_account is not null
      and external_account_id is not null
      and external_account <> external_account_id
  ) then
    raise exception using message = 'integration_connections_conflicting_external_account_values';
  end if;
end
$$;

update public.integration_connections
set id = coalesce(id, gen_random_uuid()),
    provider = coalesce(provider, provider_id),
    provider_id = coalesce(provider_id, provider),
    status = coalesce(status, 'connected'),
    scopes = coalesce(scopes, scope),
    scope = coalesce(scope, scopes),
    external_account = coalesce(external_account, external_account_id),
    external_account_id = coalesce(external_account_id, external_account),
    metadata = coalesce(metadata, '{}'::jsonb),
    connected_at = coalesce(connected_at, created_at, now()),
    created_at = coalesce(created_at, connected_at, now()),
    updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  if exists (
    select 1 from public.integration_connections
    where id is null or user_id is null
  ) then
    raise exception using message = 'integration_connections_missing_ownership_values';
  end if;
  if exists (
    select 1 from public.integration_connections
    where provider is null or provider_id is null
  ) then
    raise exception using message = 'integration_connections_missing_provider_values';
  end if;
  if exists (
    select 1 from public.integration_connections
    group by user_id, provider
    having count(*) > 1
  ) then
    raise exception using message = 'integration_connections_duplicate_canonical_provider';
  end if;
  if exists (
    select 1 from public.integration_connections
    group by user_id, provider_id
    having count(*) > 1
  ) then
    raise exception using message = 'integration_connections_duplicate_provider_mirror';
  end if;
end
$$;

alter table public.integration_connections
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column user_id set not null,
  alter column provider set not null,
  alter column provider_id set not null,
  alter column status set default 'connected',
  alter column status set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column connected_at set default now(),
  alter column connected_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass and contype = 'p'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, provider)'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_user_provider_key unique (user_id, provider);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, provider_id)'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_user_provider_id_key unique (user_id, provider_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and conname = 'integration_connections_provider_mirror_check'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_provider_mirror_check
      check (provider = provider_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and conname = 'integration_connections_scope_mirror_check'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_scope_mirror_check
      check (scopes is not distinct from scope);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integration_connections'::regclass
      and conname = 'integration_connections_external_account_mirror_check'
  ) then
    alter table public.integration_connections
      add constraint integration_connections_external_account_mirror_check
      check (external_account is not distinct from external_account_id);
  end if;
end
$$;

create index if not exists integration_connections_user_idx
  on public.integration_connections(user_id);
create index if not exists integration_connections_user_provider_idx
  on public.integration_connections(user_id, provider_id);

drop trigger if exists set_integration_connections_updated_at on public.integration_connections;
create trigger set_integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;

drop policy if exists "owner_select" on public.integration_connections;
drop policy if exists "Users can view own integration connections" on public.integration_connections;
drop policy if exists "Users can insert own integration connections" on public.integration_connections;
drop policy if exists "Users can update own integration connections" on public.integration_connections;
drop policy if exists "Users can delete own integration connections" on public.integration_connections;

create policy "owner_select" on public.integration_connections
  for select to authenticated using (auth.uid() = user_id);

revoke all privileges on table public.integration_connections from anon, authenticated;
grant select (
  user_id, provider, status, scopes, external_account,
  created_at, connected_at, expires_at
) on table public.integration_connections to authenticated;

-- Mason uses the RLS-scoped server client for append/read. The ledger is
-- intentionally append-only: authenticated may SELECT and INSERT own rows,
-- while UPDATE and DELETE remain unavailable both by grants and RLS policies.
revoke all privileges on table public.mason_execution_events from anon;
revoke update, delete on table public.mason_execution_events from authenticated;
grant select, insert on table public.mason_execution_events to authenticated;
