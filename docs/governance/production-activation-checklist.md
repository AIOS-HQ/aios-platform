# Production Activation Checklist

This checklist covers the migrations and runtime switches that cannot be safely
assumed from source code alone. Do not apply these commands to AirBid or any
unknown Supabase project.

## Required Migration Verification

Verify the linked AIOS Supabase project first:

```bash
supabase migration list --linked
supabase db push --dry-run
```

Review the proposed changes. If and only if the linked project is the correct
AIOS production project, apply:

```bash
supabase db push
```

Confirm these migrations are present:

- `20260705000000_aios_uploads_storage.sql`
- `20260712000000_social_publishing_jobs.sql`
- `20260712010000_youtube_production_publishing.sql`
- `20260713000000_event_mesh.sql`
- `20260713010000_profile_photo_path.sql`

Post-apply SQL checks:

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
where version in (
  '20260705000000',
  '20260712000000',
  '20260712010000',
  '20260713000000',
  '20260713010000'
)
order by version;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'profile_photo_path';

select id, name, public
from storage.buckets
where id = 'aios-uploads';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'aios_uploads_%'
order by policyname;
```

## Profile Photos

Expected setup:

- private Supabase Storage bucket: `aios-uploads`;
- owner-scoped object path: `<auth.uid()>/profile/<timestamp>-<uuid>-<safe-name>`;
- profile row column: `public.profiles.profile_photo_path`;
- signed read URLs generated server-side only.

Manual acceptance:

1. Open `/settings/branding`.
2. Upload a JPG, PNG, WEBP, or GIF at 5 MB or less.
3. Confirm immediate preview, success message, user-menu avatar update, and
   persistence after reload/logout/login.
4. Replace the photo.
5. Remove the photo and confirm initials return.
6. Try an SVG or oversized file and confirm a clear error.

## Event Mesh

Safe production target for this milestone:

- `AIOS_EVENT_MESH_PROVIDER=postgres`;
- `AIOS_EVENT_MESH_OUTBOX_ENABLED=true`;
- `AIOS_EVENT_MESH_WORKFORCE_EXECUTION=false` until migration and worker smoke
  are verified;
- no production use of `AIOS_EVENT_MESH_PROVIDER=local`;
- Postgres worker configured with service-worker credentials only where needed.

Rollback:

```bash
AIOS_EVENT_MESH_OUTBOX_ENABLED=false
AIOS_EVENT_MESH_WORKFORCE_EXECUTION=false
```

Stop any worker processes. Existing synchronous A2A, approvals, Julius,
Company Skills, connector runtime, Social publishing, and Mason behavior remain
authoritative.
