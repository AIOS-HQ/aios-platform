-- Compatibility bridge for the conflicting historical integration_connections
-- definitions. This sorts immediately before 20260617120000 so a brand-new
-- database can apply the complete chronological history without that migration
-- referencing columns the original 20260603000000 table did not create.
--
-- Existing environments may apply this out of order with `db push --include-all`.
-- It is additive, preserves both column families, and refuses conflicting data.

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
  add column if not exists provider text,
  add column if not exists provider_id text,
  add column if not exists scopes text,
  add column if not exists scope text,
  add column if not exists external_account text,
  add column if not exists external_account_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists connected_at timestamptz;

do $$
begin
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
set provider = coalesce(provider, provider_id),
    provider_id = coalesce(provider_id, provider),
    scopes = coalesce(scopes, scope),
    scope = coalesce(scope, scopes),
    external_account = coalesce(external_account, external_account_id),
    external_account_id = coalesce(external_account_id, external_account),
    metadata = coalesce(metadata, '{}'::jsonb),
    connected_at = coalesce(connected_at, created_at, now());

do $$
begin
  if exists (
    select 1 from public.integration_connections
    where provider is null or provider_id is null
  ) then
    raise exception using message = 'integration_connections_missing_provider_values';
  end if;
  if exists (
    select 1
    from public.integration_connections
    group by user_id, provider
    having count(*) > 1
  ) then
    raise exception using message = 'integration_connections_duplicate_canonical_provider';
  end if;
end
$$;

alter table public.integration_connections
  alter column provider set not null,
  alter column provider_id set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column connected_at set default now(),
  alter column connected_at set not null;

do $$
begin
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
end
$$;
