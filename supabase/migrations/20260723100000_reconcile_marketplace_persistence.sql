-- Forward reconciliation for the repository-backed Marketplace persistence
-- contract. It converges absent, historical, and partially created schemas
-- without dropping populated columns or overwriting conflicting ownership.

create extension if not exists pgcrypto;

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  kind text not null,
  slug text not null,
  name text not null,
  description text not null,
  visibility text not null default 'company_private',
  verification text not null default 'unverified',
  license text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.marketplace_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.marketplace_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  changelog text,
  checksum text,
  artifact_ref text,
  dependencies jsonb not null default '[]'::jsonb,
  min_runtime text,
  yanked boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.marketplace_item_ratings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.marketplace_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.company_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null references public.marketplace_items(id) on delete cascade,
  kind text not null,
  installed_version text not null,
  source text not null,
  enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_items
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists company_id uuid,
  add column if not exists kind text,
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists visibility text,
  add column if not exists verification text,
  add column if not exists license text,
  add column if not exists tags text[] default '{}',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
alter table public.marketplace_item_versions
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists item_id uuid,
  add column if not exists user_id uuid,
  add column if not exists version text,
  add column if not exists changelog text,
  add column if not exists checksum text,
  add column if not exists artifact_ref text,
  add column if not exists dependencies jsonb default '[]'::jsonb,
  add column if not exists min_runtime text,
  add column if not exists yanked boolean default false,
  add column if not exists created_at timestamptz default now();
alter table public.marketplace_item_ratings
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists item_id uuid,
  add column if not exists user_id uuid,
  add column if not exists stars smallint,
  add column if not exists comment text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
alter table public.company_installations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists company_id uuid,
  add column if not exists item_id uuid,
  add column if not exists kind text,
  add column if not exists installed_version text,
  add column if not exists source text,
  add column if not exists enabled boolean default true,
  add column if not exists installed_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
declare
  incompatible text;
begin
  select string_agg(e.table_name || '.' || e.column_name, ', ' order by e.table_name, e.column_name)
  into incompatible
  from (values
    ('marketplace_items', 'id', array['uuid']),
    ('marketplace_items', 'user_id', array['uuid']),
    ('marketplace_items', 'company_id', array['uuid']),
    ('marketplace_items', 'kind', array['text','varchar']),
    ('marketplace_items', 'slug', array['text','varchar']),
    ('marketplace_items', 'name', array['text','varchar']),
    ('marketplace_items', 'description', array['text','varchar']),
    ('marketplace_items', 'visibility', array['text','varchar']),
    ('marketplace_items', 'verification', array['text','varchar']),
    ('marketplace_items', 'license', array['text','varchar']),
    ('marketplace_items', 'tags', array['_text']),
    ('marketplace_item_versions', 'id', array['uuid']),
    ('marketplace_item_versions', 'item_id', array['uuid']),
    ('marketplace_item_versions', 'user_id', array['uuid']),
    ('marketplace_item_versions', 'version', array['text','varchar']),
    ('marketplace_item_versions', 'dependencies', array['jsonb']),
    ('marketplace_item_versions', 'yanked', array['bool']),
    ('marketplace_item_ratings', 'id', array['uuid']),
    ('marketplace_item_ratings', 'item_id', array['uuid']),
    ('marketplace_item_ratings', 'user_id', array['uuid']),
    ('marketplace_item_ratings', 'stars', array['int2','int4','int8']),
    ('company_installations', 'id', array['uuid']),
    ('company_installations', 'user_id', array['uuid']),
    ('company_installations', 'company_id', array['uuid']),
    ('company_installations', 'item_id', array['uuid']),
    ('company_installations', 'kind', array['text','varchar']),
    ('company_installations', 'installed_version', array['text','varchar']),
    ('company_installations', 'source', array['text','varchar']),
    ('company_installations', 'enabled', array['bool'])
  ) as e(table_name, column_name, allowed_udt_names)
  join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
  where not (c.udt_name = any(e.allowed_udt_names));

  if incompatible is not null then
    raise exception using message = 'marketplace_incompatible_column_types: ' || incompatible;
  end if;
end
$$;

update public.marketplace_items
set id = coalesce(id, gen_random_uuid()),
    description = coalesce(description, ''),
    tags = coalesce(tags, '{}'),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now());
update public.marketplace_item_versions v
set id = coalesce(v.id, gen_random_uuid()),
    user_id = coalesce(v.user_id, i.user_id),
    dependencies = coalesce(v.dependencies, '[]'::jsonb),
    yanked = coalesce(v.yanked, false),
    created_at = coalesce(v.created_at, now())
from public.marketplace_items i
where i.id = v.item_id;
update public.marketplace_item_ratings
set id = coalesce(id, gen_random_uuid()),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now());
update public.company_installations ci
set id = coalesce(ci.id, gen_random_uuid()),
    user_id = coalesce(ci.user_id, c.user_id),
    kind = coalesce(ci.kind, i.kind),
    source = coalesce(ci.source, i.visibility),
    enabled = coalesce(ci.enabled, true),
    installed_at = coalesce(ci.installed_at, now()),
    updated_at = coalesce(ci.updated_at, ci.installed_at, now())
from public.companies c, public.marketplace_items i
where c.id = ci.company_id and i.id = ci.item_id;

do $$
begin
  if exists (select 1 from public.marketplace_items where
    id is null or user_id is null or kind is null or slug is null or name is null
    or visibility is null or verification is null) then
    raise exception using message = 'marketplace_items_missing_required_values';
  end if;
  if exists (select 1 from public.marketplace_item_versions where
    id is null or item_id is null or user_id is null or version is null) then
    raise exception using message = 'marketplace_versions_missing_required_values';
  end if;
  if exists (select 1 from public.marketplace_item_ratings where
    id is null or item_id is null or user_id is null or stars is null) then
    raise exception using message = 'marketplace_ratings_missing_required_values';
  end if;
  if exists (select 1 from public.company_installations where
    id is null or user_id is null or company_id is null or item_id is null
    or kind is null or installed_version is null or source is null) then
    raise exception using message = 'marketplace_installations_missing_required_values';
  end if;
  if exists (select slug from public.marketplace_items group by slug having count(*) > 1) then
    raise exception using message = 'marketplace_duplicate_slugs';
  end if;
  if exists (select item_id, version from public.marketplace_item_versions
    group by item_id, version having count(*) > 1) then
    raise exception using message = 'marketplace_duplicate_versions';
  end if;
  if exists (select item_id, user_id from public.marketplace_item_ratings
    group by item_id, user_id having count(*) > 1) then
    raise exception using message = 'marketplace_duplicate_ratings';
  end if;
  if exists (select company_id, item_id from public.company_installations
    group by company_id, item_id having count(*) > 1) then
    raise exception using message = 'marketplace_duplicate_installations';
  end if;
  if exists (
    select 1 from public.marketplace_items i join public.companies c on c.id = i.company_id
    where i.user_id <> c.user_id
  ) then raise exception using message = 'marketplace_item_company_owner_mismatch'; end if;
  if exists (
    select 1 from public.marketplace_item_versions v join public.marketplace_items i on i.id = v.item_id
    where v.user_id <> i.user_id
  ) then raise exception using message = 'marketplace_version_owner_mismatch'; end if;
  if exists (
    select 1 from public.company_installations ci join public.companies c on c.id = ci.company_id
    where ci.user_id <> c.user_id
  ) then raise exception using message = 'marketplace_installation_company_owner_mismatch'; end if;
  if exists (
    select 1 from public.company_installations ci join public.marketplace_items i on i.id = ci.item_id
    where ci.kind <> i.kind
  ) then raise exception using message = 'marketplace_installation_kind_mismatch'; end if;
end
$$;

alter table public.marketplace_items
  alter column id set default gen_random_uuid(), alter column id set not null,
  alter column user_id set not null, alter column kind set not null,
  alter column slug set not null, alter column name set not null,
  alter column description set not null,
  alter column visibility set default 'company_private', alter column visibility set not null,
  alter column verification set default 'unverified', alter column verification set not null,
  alter column tags set default '{}', alter column tags set not null,
  alter column created_at set default now(), alter column created_at set not null,
  alter column updated_at set default now(), alter column updated_at set not null;
alter table public.marketplace_item_versions
  alter column id set default gen_random_uuid(), alter column id set not null,
  alter column item_id set not null, alter column user_id set not null,
  alter column version set not null,
  alter column dependencies set default '[]'::jsonb, alter column dependencies set not null,
  alter column yanked set default false, alter column yanked set not null,
  alter column created_at set default now(), alter column created_at set not null;
alter table public.marketplace_item_ratings
  alter column id set default gen_random_uuid(), alter column id set not null,
  alter column item_id set not null, alter column user_id set not null,
  alter column stars set not null,
  alter column created_at set default now(), alter column created_at set not null,
  alter column updated_at set default now(), alter column updated_at set not null;
alter table public.company_installations
  alter column id set default gen_random_uuid(), alter column id set not null,
  alter column user_id set not null, alter column company_id set not null,
  alter column item_id set not null, alter column kind set not null,
  alter column installed_version set not null, alter column source set not null,
  alter column enabled set default true, alter column enabled set not null,
  alter column installed_at set default now(), alter column installed_at set not null,
  alter column updated_at set default now(), alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_items'::regclass and contype='p') then
    alter table public.marketplace_items add constraint marketplace_items_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_versions'::regclass and contype='p') then
    alter table public.marketplace_item_versions add constraint marketplace_item_versions_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_ratings'::regclass and contype='p') then
    alter table public.marketplace_item_ratings add constraint marketplace_item_ratings_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='p') then
    alter table public.company_installations add constraint company_installations_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_items'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
    alter table public.marketplace_items add constraint marketplace_items_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_items'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE') then
    alter table public.marketplace_items add constraint marketplace_items_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_versions'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE') then
    alter table public.marketplace_item_versions add constraint marketplace_item_versions_item_id_fkey foreign key (item_id) references public.marketplace_items(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_versions'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
    alter table public.marketplace_item_versions add constraint marketplace_item_versions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_ratings'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE') then
    alter table public.marketplace_item_ratings add constraint marketplace_item_ratings_item_id_fkey foreign key (item_id) references public.marketplace_items(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_ratings'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
    alter table public.marketplace_item_ratings add constraint marketplace_item_ratings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
    alter table public.company_installations add constraint company_installations_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE') then
    alter table public.company_installations add constraint company_installations_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='f' and pg_get_constraintdef(oid)='FOREIGN KEY (item_id) REFERENCES marketplace_items(id) ON DELETE CASCADE') then
    alter table public.company_installations add constraint company_installations_item_id_fkey foreign key (item_id) references public.marketplace_items(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_items'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (slug)') then
    alter table public.marketplace_items add constraint marketplace_items_slug_key unique (slug);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_versions'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (item_id, version)') then
    alter table public.marketplace_item_versions add constraint marketplace_item_versions_item_version_key unique (item_id, version);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_ratings'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (item_id, user_id)') then
    alter table public.marketplace_item_ratings add constraint marketplace_item_ratings_item_user_key unique (item_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (company_id, item_id)') then
    alter table public.company_installations add constraint company_installations_company_item_key unique (company_id, item_id);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='marketplace_items_kind_check' and conrelid='public.marketplace_items'::regclass) then
    alter table public.marketplace_items add constraint marketplace_items_kind_check check (kind in (
      'workforce','skill','department','connector','workflow','automation','dashboard','industry',
      'branding_pack','knowledge_pack','founder_pack','developer_tool','company_template'));
  end if;
  if not exists (select 1 from pg_constraint where conname='marketplace_items_visibility_check' and conrelid='public.marketplace_items'::regclass) then
    alter table public.marketplace_items add constraint marketplace_items_visibility_check check (visibility in ('company_private','marketplace_public'));
  end if;
  if not exists (select 1 from pg_constraint where conname='marketplace_items_verification_check' and conrelid='public.marketplace_items'::regclass) then
    alter table public.marketplace_items add constraint marketplace_items_verification_check check (verification in ('unverified','pending','verified','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='marketplace_item_ratings_stars_check' and conrelid='public.marketplace_item_ratings'::regclass) then
    alter table public.marketplace_item_ratings add constraint marketplace_item_ratings_stars_check check (stars between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname='company_installations_kind_check' and conrelid='public.company_installations'::regclass) then
    alter table public.company_installations add constraint company_installations_kind_check check (kind in (
      'workforce','skill','department','connector','workflow','automation','dashboard','industry',
      'branding_pack','knowledge_pack','founder_pack','developer_tool','company_template'));
  end if;
  if not exists (select 1 from pg_constraint where conname='company_installations_source_check' and conrelid='public.company_installations'::regclass) then
    alter table public.company_installations add constraint company_installations_source_check check (source in ('company_private','marketplace_public'));
  end if;
end
$$;

create index if not exists marketplace_items_user_idx on public.marketplace_items(user_id);
create index if not exists marketplace_items_company_idx on public.marketplace_items(company_id);
create index if not exists marketplace_items_visibility_verification_idx on public.marketplace_items(visibility, verification);
create index if not exists marketplace_item_versions_item_created_idx on public.marketplace_item_versions(item_id, created_at desc);
create index if not exists marketplace_item_ratings_item_created_idx on public.marketplace_item_ratings(item_id, created_at desc);
create index if not exists company_installations_user_company_idx on public.company_installations(user_id, company_id);
create index if not exists company_installations_item_idx on public.company_installations(item_id);

drop trigger if exists set_marketplace_items_updated_at on public.marketplace_items;
create trigger set_marketplace_items_updated_at before update on public.marketplace_items for each row execute function public.set_updated_at();
drop trigger if exists set_marketplace_item_ratings_updated_at on public.marketplace_item_ratings;
create trigger set_marketplace_item_ratings_updated_at before update on public.marketplace_item_ratings for each row execute function public.set_updated_at();
drop trigger if exists set_company_installations_updated_at on public.company_installations;
create trigger set_company_installations_updated_at before update on public.company_installations for each row execute function public.set_updated_at();

alter table public.marketplace_items enable row level security;
alter table public.marketplace_item_versions enable row level security;
alter table public.marketplace_item_ratings enable row level security;
alter table public.company_installations enable row level security;

drop policy if exists "select_own_or_public_verified" on public.marketplace_items;
drop policy if exists "owner_insert_private" on public.marketplace_items;
drop policy if exists "owner_update_private" on public.marketplace_items;
drop policy if exists "owner_delete_private" on public.marketplace_items;
create policy "select_own_or_public_verified" on public.marketplace_items for select to authenticated
  using (auth.uid()=user_id or (visibility='marketplace_public' and verification='verified'));
create policy "owner_insert_private" on public.marketplace_items for insert to authenticated
  with check (auth.uid()=user_id and visibility='company_private' and verification='unverified');
create policy "owner_update_private" on public.marketplace_items for update to authenticated
  using (auth.uid()=user_id and visibility='company_private' and verification='unverified')
  with check (auth.uid()=user_id and visibility='company_private' and verification='unverified');
create policy "owner_delete_private" on public.marketplace_items for delete to authenticated
  using (auth.uid()=user_id and visibility='company_private' and verification='unverified');

drop policy if exists "select_own_or_public_verified" on public.marketplace_item_versions;
drop policy if exists "owner_insert_private" on public.marketplace_item_versions;
drop policy if exists "owner_update_private" on public.marketplace_item_versions;
drop policy if exists "owner_delete_private" on public.marketplace_item_versions;
create policy "select_own_or_public_verified" on public.marketplace_item_versions for select to authenticated using (
  auth.uid()=user_id or exists (select 1 from public.marketplace_items i where i.id=item_id and i.visibility='marketplace_public' and i.verification='verified'));
create policy "owner_insert_private" on public.marketplace_item_versions for insert to authenticated with check (
  auth.uid()=user_id and exists (select 1 from public.marketplace_items i where i.id=item_id and i.user_id=auth.uid() and i.visibility='company_private' and i.verification='unverified'));
create policy "owner_update_private" on public.marketplace_item_versions for update to authenticated using (
  auth.uid()=user_id and exists (select 1 from public.marketplace_items i where i.id=item_id and i.user_id=auth.uid() and i.visibility='company_private' and i.verification='unverified'))
  with check (auth.uid()=user_id and exists (select 1 from public.marketplace_items i where i.id=item_id and i.user_id=auth.uid() and i.visibility='company_private' and i.verification='unverified'));
create policy "owner_delete_private" on public.marketplace_item_versions for delete to authenticated using (
  auth.uid()=user_id and exists (select 1 from public.marketplace_items i where i.id=item_id and i.user_id=auth.uid() and i.visibility='company_private' and i.verification='unverified'));

drop policy if exists "select_own_or_public_verified" on public.marketplace_item_ratings;
drop policy if exists "rater_insert" on public.marketplace_item_ratings;
drop policy if exists "rater_update" on public.marketplace_item_ratings;
drop policy if exists "rater_delete" on public.marketplace_item_ratings;
create policy "select_own_or_public_verified" on public.marketplace_item_ratings for select to authenticated using (
  auth.uid()=user_id or exists (select 1 from public.marketplace_items i where i.id=item_id and i.visibility='marketplace_public' and i.verification='verified'));
create policy "rater_insert" on public.marketplace_item_ratings for insert to authenticated with check (
  auth.uid()=user_id and exists (select 1 from public.marketplace_items i where i.id=item_id and i.visibility='marketplace_public' and i.verification='verified'));
create policy "rater_update" on public.marketplace_item_ratings for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "rater_delete" on public.marketplace_item_ratings for delete to authenticated using (auth.uid()=user_id);

drop policy if exists "owner_select" on public.company_installations;
drop policy if exists "owner_insert" on public.company_installations;
drop policy if exists "owner_update" on public.company_installations;
drop policy if exists "owner_delete" on public.company_installations;
create policy "owner_select" on public.company_installations for select to authenticated using (auth.uid()=user_id);
create policy "owner_insert" on public.company_installations for insert to authenticated with check (
  auth.uid()=user_id and exists (select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
create policy "owner_update" on public.company_installations for update to authenticated using (auth.uid()=user_id) with check (
  auth.uid()=user_id and exists (select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
create policy "owner_delete" on public.company_installations for delete to authenticated using (auth.uid()=user_id);

create or replace function public.marketplace_install_counts()
returns table(item_id uuid, install_count bigint)
language sql stable security definer set search_path=''
as $$
  select ci.item_id, count(distinct ci.company_id)::bigint
  from public.company_installations ci group by ci.item_id
$$;
revoke all on function public.marketplace_install_counts() from public, anon;
grant execute on function public.marketplace_install_counts() to authenticated, service_role;

revoke all privileges on table public.marketplace_items from anon;
revoke all privileges on table public.marketplace_item_versions from anon;
revoke all privileges on table public.marketplace_item_ratings from anon;
revoke all privileges on table public.company_installations from anon;
grant select, insert, update, delete on table public.marketplace_items to authenticated, service_role;
grant select, insert, update, delete on table public.marketplace_item_versions to authenticated, service_role;
grant select, insert, update, delete on table public.marketplace_item_ratings to authenticated, service_role;
grant select, insert, update, delete on table public.company_installations to authenticated, service_role;
