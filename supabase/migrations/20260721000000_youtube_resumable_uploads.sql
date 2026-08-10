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
    check (status in ('authorized','uploading','verifying','verified','finalized','failed','cancelled','expired')),
  authorization_expires_at timestamptz not null,
  expires_at timestamptz not null,
  verification_token uuid,
  verification_started_at timestamptz,
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
create index if not exists social_upload_intents_authorization_expiry_idx
  on public.social_upload_intents(status, authorization_expires_at);

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

-- A content digest is evidence, not an object identity. The same immutable
-- bytes may be uploaded again under a different, server-owned intent without
-- changing either asset's ownership or storage path. Finalization idempotency
-- is enforced by the intent/job identities below rather than by conflating
-- equal media bytes into one row.
alter table public.social_media_assets
  drop constraint if exists social_media_assets_user_id_provider_checksum_sha256_key;
create index if not exists social_media_assets_content_digest_idx
  on public.social_media_assets(user_id, company_id, provider, checksum_sha256);

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

-- Storage mutation and finalization coordinate on the upload-intent row lock.
-- A TUS/object mutation that starts first holds this lock until it commits;
-- finalization waits for it, then changes the intent to `verifying`. A mutation
-- that starts after the claim waits and then fails closed because the intent is
-- no longer active.
create or replace function public.social_upload_storage_mutation_allowed(
  p_object_name text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    return false;
  end if;
  select true into allowed
  from public.social_upload_intents intent
  where intent.storage_path = p_object_name
    and intent.user_id = p_user_id
    and intent.provider = 'youtube'
    and intent.status in ('authorized','uploading')
    and intent.authorization_expires_at > now()
    and intent.expires_at > now()
  for update;
  return coalesce(allowed, false);
end;
$$;

revoke all on function public.social_upload_storage_mutation_allowed(text, uuid) from public, anon;
grant execute on function public.social_upload_storage_mutation_allowed(text, uuid) to authenticated, service_role;

create or replace function public.claim_youtube_upload_intents(
  p_user_id uuid,
  p_company_id uuid,
  p_client_request_id uuid,
  p_video_id uuid,
  p_thumbnail_id uuid,
  p_verification_token uuid
)
returns setof public.social_upload_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count int := case when p_thumbnail_id is null then 1 else 2 end;
  matched_count int;
  ids uuid[] := case when p_thumbnail_id is null
    then array[p_video_id]
    else array[p_video_id, p_thumbnail_id]
  end;
begin
  perform 1
  from public.social_upload_intents intent
  where intent.id = any(ids)
  order by intent.id
  for update;

  select count(*) into matched_count
  from public.social_upload_intents intent
  where intent.id = any(ids)
    and intent.user_id = p_user_id
    and intent.company_id = p_company_id
    and intent.client_request_id = p_client_request_id
    and intent.provider = 'youtube'
    and intent.status in ('authorized','uploading')
    and intent.expires_at > now()
    and (
      (intent.id = p_video_id and intent.kind = 'video')
      or (p_thumbnail_id is not null and intent.id = p_thumbnail_id and intent.kind = 'thumbnail')
    );

  if matched_count <> expected_count then
    raise exception 'youtube_upload_intents_not_claimable' using errcode = 'P0001';
  end if;

  update public.social_upload_intents
  set status = 'verifying',
      verification_token = p_verification_token,
      verification_started_at = now(),
      error_code = null
  where id = any(ids);

  return query
  select intent.*
  from public.social_upload_intents intent
  where intent.id = any(ids)
  order by case when intent.id = p_video_id then 0 else 1 end;
end;
$$;

revoke all on function public.claim_youtube_upload_intents(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_youtube_upload_intents(uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

create or replace function public.finalize_youtube_upload_draft(
  p_user_id uuid,
  p_company_id uuid,
  p_client_request_id uuid,
  p_video_id uuid,
  p_thumbnail_id uuid,
  p_verification_token uuid,
  p_job_id uuid
)
returns public.social_publish_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count int := case when p_thumbnail_id is null then 1 else 2 end;
  matched_count int;
  ids uuid[] := case when p_thumbnail_id is null
    then array[p_video_id]
    else array[p_video_id, p_thumbnail_id]
  end;
  result public.social_publish_jobs;
begin
  perform 1
  from public.social_upload_intents intent
  where intent.id = any(ids)
  order by intent.id
  for update;

  select count(*) into matched_count
  from public.social_upload_intents intent
  where intent.id = any(ids)
    and intent.user_id = p_user_id
    and intent.company_id = p_company_id
    and intent.client_request_id = p_client_request_id
    and intent.verification_token = p_verification_token
    and intent.status = 'verifying';
  if matched_count <> expected_count then
    raise exception 'youtube_upload_verification_not_owned' using errcode = 'P0001';
  end if;

  perform 1
  from public.social_publish_jobs job
  where job.id = p_job_id
    and job.user_id = p_user_id
    and job.company_id = p_company_id
    and job.provider = 'youtube'
    and job.state = 'preparing_media'
    and job.approved_content_hash is null
  for update;
  if not found then
    raise exception 'youtube_upload_job_not_staged' using errcode = 'P0001';
  end if;

  select count(*) into matched_count
  from public.social_media_assets asset
  where asset.id = any(ids)
    and asset.user_id = p_user_id
    and asset.company_id = p_company_id
    and asset.provider = 'youtube'
    and asset.state = 'validated';
  if matched_count <> expected_count then
    raise exception 'youtube_upload_assets_not_staged' using errcode = 'P0001';
  end if;

  update public.social_media_assets
  set state = 'ready'
  where id = any(ids)
    and user_id = p_user_id
    and company_id = p_company_id;

  update public.social_publish_jobs
  set state = 'awaiting_approval'
  where id = p_job_id
  returning * into result;

  update public.social_upload_intents intent
  set status = 'finalized',
      asset_id = intent.id,
      job_id = p_job_id,
      verification_token = null
  where intent.id = any(ids)
    and intent.verification_token = p_verification_token;

  return result;
end;
$$;

revoke all on function public.finalize_youtube_upload_draft(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_youtube_upload_draft(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

create or replace function public.fail_youtube_upload_verification(
  p_user_id uuid,
  p_company_id uuid,
  p_verification_token uuid,
  p_error_code text,
  p_job_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  perform 1
  from public.social_upload_intents intent
  where intent.user_id = p_user_id
    and intent.company_id = p_company_id
    and intent.verification_token = p_verification_token
    and intent.status = 'verifying'
  order by intent.id
  for update;

  select array_agg(intent.id) into ids
  from public.social_upload_intents intent
  where intent.user_id = p_user_id
    and intent.company_id = p_company_id
    and intent.verification_token = p_verification_token
    and intent.status = 'verifying';

  if ids is null then
    return;
  end if;

  update public.social_upload_intents
  set status = 'failed',
      verification_token = null,
      error_code = left(coalesce(p_error_code, 'verification_failed'), 80)
  where id = any(ids);

  if p_job_id is not null then
    delete from public.social_publish_jobs
    where id = p_job_id
      and user_id = p_user_id
      and company_id = p_company_id
      and provider = 'youtube'
      and state = 'preparing_media';
  end if;

  delete from public.social_media_assets
  where id = any(ids)
    and user_id = p_user_id
    and company_id = p_company_id
    and provider = 'youtube'
    and state = 'validated';
end;
$$;

revoke all on function public.fail_youtube_upload_verification(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fail_youtube_upload_verification(uuid, uuid, uuid, text, uuid) to service_role;

-- YouTube object access is available only while the server-owned intent is an
-- active, unexpired upload. Verification/finalization uses the service-role
-- path and therefore remains able to read an immutable object.
drop policy if exists "aios_uploads_select" on storage.objects;
create policy "aios_uploads_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or public.social_upload_storage_mutation_allowed(name, auth.uid())
    )
  );

drop policy if exists "aios_uploads_insert" on storage.objects;
create policy "aios_uploads_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or public.social_upload_storage_mutation_allowed(name, auth.uid())
    )
  );

drop policy if exists "aios_uploads_update" on storage.objects;
create policy "aios_uploads_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or public.social_upload_storage_mutation_allowed(name, auth.uid())
    )
  )
  with check (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or public.social_upload_storage_mutation_allowed(name, auth.uid())
    )
  );

drop policy if exists "aios_uploads_delete" on storage.objects;
create policy "aios_uploads_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'aios-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      coalesce((storage.foldername(name))[3], '') <> 'social'
      or coalesce((storage.foldername(name))[4], '') <> 'youtube'
      or public.social_upload_storage_mutation_allowed(name, auth.uid())
    )
  );
