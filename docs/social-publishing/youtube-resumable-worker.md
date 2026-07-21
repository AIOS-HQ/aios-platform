# YouTube resumable publishing

AIOS separates browser ingest from external publishing so normal video files do
not cross a Next.js Server Action or Vercel request body.

## Data path

1. A Founder requests an upload intent with file metadata only.
2. AIOS creates a 15-minute, user/company-bound intent and a fixed signed path
   in the private `aios-uploads` bucket.
3. The browser uploads directly to Supabase Storage's TUS endpoint in 6 MiB
   chunks using the authenticated user session and existing owner RLS.
4. Finalization accepts IDs and draft metadata only. It checks the stored
   object's authoritative size and MIME type, channel ownership, playlist,
   media constraints, and tenant ownership before idempotently creating the
   asset and `awaiting_approval` job.
5. Founder approval records the exact content hash. The Publish control only
   queues YouTube work; it never transfers video inside the browser request.
6. A persistent Node worker reads the private object in bounded 8 MiB ranges,
   sends correct YouTube resumable requests, and persists every acknowledged
   byte offset. HTTP 308 continuation and transient retry status queries never
   resend bytes that YouTube already acknowledged.

Signed upload tokens, OAuth tokens, storage signed URLs, YouTube session URLs,
credentials, and video bytes must never be logged. YouTube session URLs remain
encrypted in `youtube_upload_sessions`.

## Worker deployment requirement

Run exactly the committed worker entrypoint in a persistent Node 22 process:

```sh
npx tsx scripts/social-publishing-worker.ts
```

The process needs the same existing Supabase service-role and token-encryption
configuration as the AIOS runtime. No new environment variable or external
queue service is introduced. Do not run the worker until migration
`20260721000000_youtube_resumable_uploads.sql` is applied. Multiple workers are
safe because jobs use conditional database locks; stale locks recover after ten
minutes.

Vercel functions are not a suitable host for the transfer loop. Deploy this
entrypoint through the existing persistent worker runtime used for background
AIOS work. Until that process is configured, draft preparation and approval are
safe, but queued YouTube jobs remain `queued` and no external publish occurs.

## Operational behavior

- Ordinary upload errors remain inline and retryable on `/harmony/social`.
- Refreshing or leaving the page never queues or publishes a video.
- Cancel explicitly aborts the browser transfer and marks the upload intent.
- Expired incomplete intents are marked `expired`; objects are not deleted
  automatically, preserving a safe audit trail for manual retention cleanup.
- Finalized objects are immutable to authenticated browser clients.
- Provider IDs and URLs are stored only after YouTube returns a successful,
  parseable completion response.
- A failed/expired YouTube session is resumed or safely reinitialized, while
  exact-content approval is rechecked before every worker attempt.

## Production verification

Use a non-public test channel and keep visibility `private`. Confirm a generated
test file uploads through TUS, finalizes once after retries/refresh, queues only
after Founder approval, and is consumed by the worker. This repository's
automated tests mock every Google request and never publish real media.
