-- ============================================================================
-- AIOS Phase 2 (P6) — Uploads Storage bucket + owner-scoped RLS.
--
-- Private bucket `aios-uploads` for Founder/company assets + chat attachments.
-- Every object lives under `${auth.uid()}/...`; the policies below enforce that
-- a user can only read/write their own objects. Private → access via short-lived
-- signed URLs (see src/lib/uploads/storage.ts). Founder-approved infrastructure.
--
-- Idempotent. Already applied to production via apply_migration; committed here
-- to keep repo ↔ database in sync.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('aios-uploads', 'aios-uploads', false)
on conflict (id) do nothing;

drop policy if exists "aios_uploads_select" on storage.objects;
create policy "aios_uploads_select" on storage.objects for select to authenticated
  using (bucket_id = 'aios-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "aios_uploads_insert" on storage.objects;
create policy "aios_uploads_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'aios-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "aios_uploads_update" on storage.objects;
create policy "aios_uploads_update" on storage.objects for update to authenticated
  using (bucket_id = 'aios-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "aios_uploads_delete" on storage.objects;
create policy "aios_uploads_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'aios-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
