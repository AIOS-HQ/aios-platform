-- AIOS YouTube direct/resumable upload and background publishing state.

create table if not exists public.social_upload_intents (
  id uuid primary key,
  client_request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider public.social_publish_provider not null default 'youtube',
  kind text not null check (kind in ('video','thumbnail')),
  storage_path text not null unique,
  file_name text not null,
  declared_mime_type text not null,
  declared_byte_size bigint not null check (declared_byte_size > 0),
  duration_seconds numeric,
  width int,
  height int,
  alt_text text,
  status text not null default 'authorized'
    check (status in ('authorized','uploading','verified','finalized','failed','cancelled','expired')),
  authorization_expires_at timestamptz not null,
  expires_at timestamptz not null,
  asset_id uuid references public.social_media_assets(id) on delete set null,
  job_id uuid references public.social_publish_jobs(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id, kind)
);

create index if not exists social_upload_intents_owner_status_idx
  on public.social_upload_intents(user_id, company_id, status, created_at desc);
create index if not exists social_upload_intents_expiry_idx
  on public.social_upload_intents(status, expires_at);

drop trigger if exists set_social_upload_intents_updated_at on public.social_upload_intents;
create trigger set_social_upload_intents_updated_at
  before update on public.social_upload_intents
  for each row execute function public.set_updated_at();

alter table public.social_upload_intents enable row level security;
drop policy if exists "owner_select" on public.social_upload_intents;
create policy "owner_select" on public.social_upload_intents
  for select to authenticated using (auth.uid() = user_id);
grant select on table public.social_upload_intents to authenticated;

create unique index if not exists social_media_assets_storage_path_unique
  on public.social_media_assets(user_id, storage_path)
  where storage_path is not null;

alter table public.youtube_upload_sessions
  add column if not exists acknowledged_offset bigint not null default 0,
  add column if not exists total_bytes bigint,
  add column if not exists retry_count int not null default 0,
  add column if not exists session_expires_at timestamptz,
  add column if not exists last_error_code text;

alter table public.youtube_upload_sessions
  drop constraint if exists youtube_upload_sessions_status_check;
alter table public.youtube_upload_sessions
  add constraint youtube_upload_sessions_status_check
  check (status in ('uploading','completed','failed','expired'));

alter table public.social_publish_jobs
  add column if not exists publish_requested_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists worker_locked_at timestamptz,
  add column if not exists worker_id text;

create index if not exists social_publish_jobs_worker_queue_idx
  on public.social_publish_jobs(next_attempt_at, created_at)
  where publish_requested_at is not null and provider = 'youtube';

-- Finalized YouTube objects are immutable. Other owner uploads retain the
-- existing update behavior.
drop policy if exists "aios_uploads_insert" on storage.objects;
create policy "aios_uploads_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or exists (
        select 1 from public.social_upload_intents intent
        where intent.user_id = auth.uid()
          and intent.storage_path = name
          and intent.status in ('authorized','uploading')
          and intent.authorization_expires_at > now()
      )
    )
  );

drop policy if exists "aios_uploads_update" on storage.objects;
create policy "aios_uploads_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.social_upload_intents intent
      where intent.user_id = auth.uid()
        and intent.storage_path = name
        and intent.status = 'finalized'
    )
  )
  with check (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.social_upload_intents intent
      where intent.user_id = auth.uid()
        and intent.storage_path = name
        and intent.status = 'finalized'
    )
  );

drop policy if exists "aios_uploads_delete" on storage.objects;
create policy "aios_uploads_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.social_upload_intents intent
      where intent.user_id = auth.uid()
        and intent.storage_path = name
        and intent.status = 'finalized'
    )
  );
