-- Repository-backed foundation for the Marketplace persistence schema that was
-- historically applied outside the migration tree. This timestamp intentionally
-- precedes the 20260705100000/120000 grant migrations and the 130000 license
-- migration so a clean database can replay the committed history in order.
--
-- Existing environments may apply this additive migration with --include-all.
-- The forward reconciliation migration at 20260723100000 independently handles
-- environments that have already advanced beyond this timestamp.

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
  updated_at timestamptz not null default now(),
  unique (slug),
  check (kind in (
    'workforce', 'skill', 'department', 'connector', 'workflow', 'automation',
    'dashboard', 'industry', 'branding_pack', 'knowledge_pack', 'founder_pack',
    'developer_tool', 'company_template'
  )),
  check (visibility in ('company_private', 'marketplace_public')),
  check (verification in ('unverified', 'pending', 'verified', 'rejected'))
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
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

create table if not exists public.marketplace_item_ratings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.marketplace_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, user_id)
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
  updated_at timestamptz not null default now(),
  unique (company_id, item_id),
  check (kind in (
    'workforce', 'skill', 'department', 'connector', 'workflow', 'automation',
    'dashboard', 'industry', 'branding_pack', 'knowledge_pack', 'founder_pack',
    'developer_tool', 'company_template'
  )),
  check (source in ('company_private', 'marketplace_public'))
);

create index if not exists marketplace_items_user_idx
  on public.marketplace_items(user_id);
create index if not exists marketplace_items_company_idx
  on public.marketplace_items(company_id);
create index if not exists marketplace_items_visibility_verification_idx
  on public.marketplace_items(visibility, verification);
create index if not exists marketplace_item_versions_item_created_idx
  on public.marketplace_item_versions(item_id, created_at desc);
create index if not exists marketplace_item_ratings_item_created_idx
  on public.marketplace_item_ratings(item_id, created_at desc);
create index if not exists company_installations_user_company_idx
  on public.company_installations(user_id, company_id);
create index if not exists company_installations_item_idx
  on public.company_installations(item_id);

drop trigger if exists set_marketplace_items_updated_at on public.marketplace_items;
create trigger set_marketplace_items_updated_at before update on public.marketplace_items
  for each row execute function public.set_updated_at();
drop trigger if exists set_marketplace_item_ratings_updated_at on public.marketplace_item_ratings;
create trigger set_marketplace_item_ratings_updated_at before update on public.marketplace_item_ratings
  for each row execute function public.set_updated_at();
drop trigger if exists set_company_installations_updated_at on public.company_installations;
create trigger set_company_installations_updated_at before update on public.company_installations
  for each row execute function public.set_updated_at();

alter table public.marketplace_items enable row level security;
alter table public.marketplace_item_versions enable row level security;
alter table public.marketplace_item_ratings enable row level security;
alter table public.company_installations enable row level security;

drop policy if exists "select_own_or_public_verified" on public.marketplace_items;
create policy "select_own_or_public_verified" on public.marketplace_items
  for select to authenticated
  using (auth.uid() = user_id or (visibility = 'marketplace_public' and verification = 'verified'));
drop policy if exists "owner_insert_private" on public.marketplace_items;
create policy "owner_insert_private" on public.marketplace_items
  for insert to authenticated
  with check (auth.uid() = user_id and visibility = 'company_private' and verification = 'unverified');
drop policy if exists "owner_update_private" on public.marketplace_items;
create policy "owner_update_private" on public.marketplace_items
  for update to authenticated
  using (auth.uid() = user_id and visibility = 'company_private' and verification = 'unverified')
  with check (auth.uid() = user_id and visibility = 'company_private' and verification = 'unverified');
drop policy if exists "owner_delete_private" on public.marketplace_items;
create policy "owner_delete_private" on public.marketplace_items
  for delete to authenticated
  using (auth.uid() = user_id and visibility = 'company_private' and verification = 'unverified');

drop policy if exists "select_own_or_public_verified" on public.marketplace_item_versions;
create policy "select_own_or_public_verified" on public.marketplace_item_versions
  for select to authenticated using (
    auth.uid() = user_id or exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.visibility = 'marketplace_public' and i.verification = 'verified'
    )
  );
drop policy if exists "owner_insert_private" on public.marketplace_item_versions;
create policy "owner_insert_private" on public.marketplace_item_versions
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.user_id = auth.uid()
        and i.visibility = 'company_private' and i.verification = 'unverified'
    )
  );
drop policy if exists "owner_update_private" on public.marketplace_item_versions;
create policy "owner_update_private" on public.marketplace_item_versions
  for update to authenticated using (
    auth.uid() = user_id and exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.user_id = auth.uid()
        and i.visibility = 'company_private' and i.verification = 'unverified'
    )
  ) with check (
    auth.uid() = user_id and exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.user_id = auth.uid()
        and i.visibility = 'company_private' and i.verification = 'unverified'
    )
  );
drop policy if exists "owner_delete_private" on public.marketplace_item_versions;
create policy "owner_delete_private" on public.marketplace_item_versions
  for delete to authenticated using (
    auth.uid() = user_id and exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.user_id = auth.uid()
        and i.visibility = 'company_private' and i.verification = 'unverified'
    )
  );

drop policy if exists "select_own_or_public_verified" on public.marketplace_item_ratings;
create policy "select_own_or_public_verified" on public.marketplace_item_ratings
  for select to authenticated using (
    auth.uid() = user_id or exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.visibility = 'marketplace_public' and i.verification = 'verified'
    )
  );
drop policy if exists "rater_insert" on public.marketplace_item_ratings;
create policy "rater_insert" on public.marketplace_item_ratings
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.marketplace_items i
      where i.id = item_id and i.visibility = 'marketplace_public' and i.verification = 'verified'
    )
  );
drop policy if exists "rater_update" on public.marketplace_item_ratings;
create policy "rater_update" on public.marketplace_item_ratings
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "rater_delete" on public.marketplace_item_ratings;
create policy "rater_delete" on public.marketplace_item_ratings
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "owner_select" on public.company_installations;
create policy "owner_select" on public.company_installations
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.company_installations;
create policy "owner_insert" on public.company_installations
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()
    )
  );
drop policy if exists "owner_update" on public.company_installations;
create policy "owner_update" on public.company_installations
  for update to authenticated using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()
    )
  );
drop policy if exists "owner_delete" on public.company_installations;
create policy "owner_delete" on public.company_installations
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.marketplace_install_counts()
returns table(item_id uuid, install_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.item_id, count(distinct ci.company_id)::bigint
  from public.company_installations ci
  group by ci.item_id
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
