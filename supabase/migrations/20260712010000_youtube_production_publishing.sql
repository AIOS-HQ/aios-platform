-- ============================================================================
-- AIOS — YouTube Production Publishing
--
-- Additive schema for YouTube as a production social publishing provider.
-- Keeps exact-content approval and existing social job governance while adding
-- YouTube-specific channel, visibility, playlist, schedule, upload progress,
-- processing status, and encrypted resumable upload recovery state.
-- ============================================================================

alter type public.social_publish_provider add value if not exists 'youtube';

alter table public.social_media_assets
  drop constraint if exists social_media_assets_kind_check;
alter table public.social_media_assets
  add constraint social_media_assets_kind_check
  check (kind in ('pdf','image','video','thumbnail'));

alter table public.social_media_assets
  add column if not exists duration_seconds numeric,
  add column if not exists youtube_processing_status text;

alter table public.social_publish_jobs
  drop constraint if exists social_publish_jobs_content_type_check;
alter table public.social_publish_jobs
  add constraint social_publish_jobs_content_type_check
  check (content_type in ('text','image','multi_image','pdf_carousel','youtube_video','youtube_short'));

alter table public.social_publish_jobs
  add column if not exists youtube_channel_id text,
  add column if not exists youtube_channel_title text,
  add column if not exists youtube_visibility text check (youtube_visibility is null or youtube_visibility in ('private','unlisted','public')),
  add column if not exists youtube_tags text[] not null default '{}'::text[],
  add column if not exists youtube_playlist_id text,
  add column if not exists youtube_playlist_title text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists upload_progress int check (upload_progress is null or (upload_progress >= 0 and upload_progress <= 100)),
  add column if not exists processing_status text check (
    processing_status is null
    or processing_status in ('queued','uploading','uploaded','processing','processed','scheduled','failed')
  );

create index if not exists social_publish_jobs_youtube_channel_idx
  on public.social_publish_jobs(user_id, provider, youtube_channel_id, state, created_at desc);

create index if not exists social_publish_jobs_scheduled_idx
  on public.social_publish_jobs(user_id, scheduled_at)
  where scheduled_at is not null;

create table if not exists public.youtube_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.social_publish_jobs(id) on delete cascade,
  upload_url_encrypted text not null,
  status text not null default 'uploading' check (status in ('uploading','completed','failed')),
  provider_video_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists youtube_upload_sessions_owner_idx
  on public.youtube_upload_sessions(user_id, status, updated_at desc);

drop trigger if exists set_youtube_upload_sessions_updated_at on public.youtube_upload_sessions;
create trigger set_youtube_upload_sessions_updated_at
  before update on public.youtube_upload_sessions
  for each row execute function public.set_updated_at();

alter table public.youtube_upload_sessions enable row level security;

drop policy if exists "owner_select" on public.youtube_upload_sessions;
create policy "owner_select" on public.youtube_upload_sessions for select using (false);
drop policy if exists "owner_insert" on public.youtube_upload_sessions;
create policy "owner_insert" on public.youtube_upload_sessions for insert with check (false);
drop policy if exists "owner_update" on public.youtube_upload_sessions;
create policy "owner_update" on public.youtube_upload_sessions for update using (false) with check (false);
