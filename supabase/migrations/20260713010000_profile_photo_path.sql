-- AIOS Core — restore persistent profile photo support.
-- Private objects remain in the owner-scoped `aios-uploads` bucket; profiles
-- store only the storage path so the app can mint short-lived signed URLs.

alter table public.profiles
  add column if not exists profile_photo_path text;

comment on column public.profiles.profile_photo_path is
  'Owner-scoped path in the private aios-uploads bucket for the current profile photo.';
