-- ============================================================================
-- AIOS — Social Publishing Jobs + Media Assets
--
-- Additive storage for Founder-approved social publishing. Credentials remain
-- encrypted in integration_connections or provider env vars; these tables store
-- only owner-scoped drafts, media metadata, approval hashes, provider IDs/URLs,
-- state, and redacted diagnostics.
-- ============================================================================

do $$ begin create type public.social_publish_provider as enum ('linkedin','x'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_publish_state as enum (
  'draft',
  'preparing_media',
  'awaiting_approval',
  'approved',
  'uploading',
  'publishing',
  'published',
  'failed',
  'cancelled'
); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_media_state as enum (
  'draft',
  'validated',
  'registered',
  'uploading',
  'processing',
  'ready',
  'failed'
); exception when duplicate_object then null; end $$;

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  provider public.social_publish_provider not null,
  kind text not null check (kind in ('pdf','image')),
  mime_type text not null,
  file_name text not null,
  storage_path text,
  byte_size bigint not null default 0,
  checksum_sha256 text not null,
  width int,
  height int,
  page_count int,
  alt_text text,
  state public.social_media_state not null default 'draft',
  provider_asset_id text,
  provider_upload_url_expires_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, checksum_sha256)
);

create index if not exists social_media_assets_owner_idx
  on public.social_media_assets(user_id, created_at desc);
create index if not exists social_media_assets_provider_idx
  on public.social_media_assets(user_id, provider, state);

create table if not exists public.social_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  provider public.social_publish_provider not null,
  content_type text not null check (content_type in ('text','image','multi_image','pdf_carousel')),
  title text not null,
  caption text not null,
  target_identity text not null,
  state public.social_publish_state not null default 'draft',
  media_asset_ids uuid[] not null default '{}'::uuid[],
  idempotency_key text not null,
  content_hash text not null,
  approved_content_hash text,
  approved_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  provider_post_url text,
  provider_asset_id text,
  attempts int not null default 0,
  last_error text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, idempotency_key)
);

create index if not exists social_publish_jobs_owner_idx
  on public.social_publish_jobs(user_id, state, created_at desc);
create index if not exists social_publish_jobs_provider_idx
  on public.social_publish_jobs(user_id, provider, state);

do $$
declare t text;
begin
  foreach t in array array['social_media_assets','social_publish_jobs']
  loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$s;', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

alter table public.social_media_assets enable row level security;
alter table public.social_publish_jobs enable row level security;

drop policy if exists "owner_select" on public.social_media_assets;
create policy "owner_select" on public.social_media_assets for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.social_media_assets;
create policy "owner_insert" on public.social_media_assets for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.social_media_assets;
create policy "owner_update" on public.social_media_assets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner_select" on public.social_publish_jobs;
create policy "owner_select" on public.social_publish_jobs for select using (auth.uid() = user_id);
drop policy if exists "owner_insert" on public.social_publish_jobs;
create policy "owner_insert" on public.social_publish_jobs for insert with check (auth.uid() = user_id);
drop policy if exists "owner_update" on public.social_publish_jobs;
create policy "owner_update" on public.social_publish_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on table public.social_media_assets to authenticated;
grant select, insert, update on table public.social_publish_jobs to authenticated;
