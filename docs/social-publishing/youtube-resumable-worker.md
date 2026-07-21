# YouTube resumable publishing

AIOS separates browser ingest from external publishing so normal video files do
not cross a Next.js Server Action or Vercel request body.

## Data path and integrity boundary

1. A Founder requests an upload intent with file metadata only. AIOS generates
   the owner/company-bound object path; the browser cannot choose it.
2. The browser uploads directly to the private `aios-uploads` bucket through
   Supabase Storage TUS in 6 MiB chunks with its authenticated session.
3. Finalization atomically changes every involved intent to `verifying` before
   storage reads begin. Storage RLS locks the same intent row for object
   mutations, so an in-flight write finishes before the freeze or is rejected
   after it. Cancelled, expired, verifying, finalized, and failed intents cannot
   mutate their object.
4. AIOS rechecks authoritative object metadata, validates the media signature,
   and computes SHA-256 over the complete object with bounded 8 MiB range reads.
   It rechecks metadata and the verification claim before atomically exposing a
   `ready` asset and `awaiting_approval` job. Verification failures leave no
   publishable asset or job.
5. Founder approval records the content hash containing the real media digest.
   Publish only queues the exact approved job; it never transfers video inside
   the browser request.
6. The persistent worker reads the private object in bounded ranges, sends
   correct YouTube resumable requests, and persists every acknowledged byte
   offset. HTTP 308 continuation and status recovery never resend acknowledged
   bytes.

OAuth tokens, storage signed URLs, YouTube session URLs, credentials, video
bytes, and authorization headers must never be logged. YouTube session URLs
remain encrypted in `youtube_upload_sessions`.

## Concrete worker deployment

The worker is an Azure Container Apps sidecar in the existing `aios-runtime`
Container App (`aios-core-rg`). It is not a Vercel function and Vercel deploys
never start it.

- Image target: `worker` in the repository `Dockerfile` (Node 22)
- Entrypoint: `npm run worker:social-publishing` (executes
  `node --conditions=react-server --import tsx scripts/social-publishing-worker.ts`)
- Container name: `social-publishing-worker`
- Liveness: `GET :8081/healthz`
- Readiness: `GET :8081/readyz`
- Restart: Azure Container Apps restarts the sidecar when its process or
  liveness probe fails.
- Concurrency: database conditional locks permit multiple replicas while a
  30-second lease heartbeat prevents a long upload from being reclaimed;
  genuinely stale locks recover after ten minutes.
- Shutdown: SIGTERM/SIGINT stops polling, closes the health server, and exits
  without claiming more work.

The Azure deployment workflow builds the web and worker images separately,
copies only existing named environment references needed by the worker from the
web container, preserves `secretRef` entries rather than reading secret values,
and refuses to copy a sensitive variable stored as a plain container value. The
first deployment adds the worker disabled:

```text
AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED=false
```

Before enabling it, an operator must:

1. Apply `supabase/migrations/20260721000000_youtube_resumable_uploads.sql` to
   the intended environment.
2. Confirm the Azure Container App already supplies, by secret reference,
   `NEXT_PUBLIC_SUPABASE_URL`, a Supabase publishable/anon key,
   `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `TOKEN_ENCRYPTION_KEY`.
3. Confirm the worker is healthy in disabled mode. Then enable only the worker
   container:

```sh
az containerapp update \
  --name aios-runtime \
  --resource-group aios-core-rg \
  --container-name social-publishing-worker \
  --set-env-vars AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED=true
```

On startup the enabled worker queries the new intent, queue, and resumable
session columns. If the migration or service-role configuration is missing,
readiness stays unavailable and the worker exits without publishing. Preview
and PR validation run with the worker disabled; automated tests mock every
Google request.

## Rollback / emergency disable

Disable the worker before rolling application code or the migration back:

```sh
az containerapp update \
  --name aios-runtime \
  --resource-group aios-core-rg \
  --container-name social-publishing-worker \
  --set-env-vars AIOS_SOCIAL_PUBLISHING_WORKER_ENABLED=false
```

Wait for the new revision and confirm `/readyz` reports `mode: disabled`. This
stops new job claims without deleting jobs, approvals, assets, or upload
sessions. Then roll the Container App revision back through the existing Azure
revision controls. Do not revert the additive migration while rows depend on
it; leaving it applied is the safe database rollback.

## Operational behavior

- Ordinary upload errors remain inline and retryable on `/harmony/social`.
- Refreshing or leaving the page never queues or publishes a video.
- Cancel aborts the browser transfer and atomically closes the upload intent.
- Expired incomplete intents are marked `expired`; objects are not silently
  deleted, preserving an auditable retention path.
- Finalized objects are immutable to authenticated browser clients.
- Provider IDs and URLs are stored only after a successful, parseable YouTube
  response.
- A failed/expired YouTube session is resumed or safely reinitialized, with
  exact-content approval checked before every worker attempt.

## Non-production verification

Use a dedicated non-production Supabase project/branch with the migration
applied and a Vercel Preview linked only to that project. Exercise TUS upload,
cancel, resume, finalization, duplicate submission, and inline failures with a
generated non-sensitive test file. Keep the Azure worker disabled and do not
connect a production YouTube channel. No automated test performs a real Google
upload.
