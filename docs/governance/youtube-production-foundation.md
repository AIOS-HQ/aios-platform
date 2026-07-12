# YouTube Production Platform

Canonical Harmony surface: `/harmony/social`.

YouTube is now implemented as a production Social publishing provider. It uses the
same Founder-approved publishing pipeline as LinkedIn and X, with YouTube-specific
channel, playlist, schedule, upload, thumbnail, processing, and recovery state.

## Architecture

- OAuth family: Google OAuth via `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
- Required scopes:
  - `https://www.googleapis.com/auth/youtube.readonly`
  - `https://www.googleapis.com/auth/youtube.upload`
  - `https://www.googleapis.com/auth/youtube.force-ssl`
- Connector metadata: `src/lib/integrations/connectors.ts` and `src/lib/integrations/catalog.ts`.
- Channel and playlist discovery: `src/lib/social-publishing/adapters/youtube.ts`.
- Publishing adapter: `src/lib/social-publishing/adapters/youtube.ts`.
- Shared governance: `src/lib/social-publishing/jobs.ts`.
- Harmony UI: `src/app/(app)/harmony/social/page.tsx`.
- Persistence: `social_publish_jobs`, `social_media_assets`, and `youtube_upload_sessions`.

## Implemented Capabilities

| Capability | Status | Evidence |
| --- | --- | --- |
| OAuth connection | READY | Shared Google OAuth flow requests read, upload, and force-SSL scopes. |
| Connected account identity | READY | Provider health and adapter verification use the connected account token. |
| Channel discovery | READY | `channels.list(mine=true)` discovers owned channels. |
| Multi-channel support | READY | Channel selection occurs before approval and is persisted on the job. |
| Channel switching | READY | The selected channel is stored per job; each draft can target a different channel. |
| Video upload | READY | Uses YouTube resumable upload initialization and upload session recovery. |
| Thumbnail upload | READY | Uses `thumbnails.set` after video upload. |
| Metadata | READY | Title, description, tags, channel, visibility, playlist, schedule, and media are hashed and persisted. |
| Visibility | READY | Private, unlisted, and public are supported. Scheduled jobs are uploaded private with `publishAt`. |
| Playlists | READY | Optional playlist selection inserts the published video into a selected playlist. |
| Scheduling | READY | Scheduled publish time is persisted before approval and sent to YouTube. |
| Shorts | READY | Shorts use the YouTube upload flow with duration/aspect validation. |
| Upload progress | READY | Upload phase and processing state are persisted on the publishing job. |
| Processing status polling | READY | The adapter polls `videos.list(part=processingDetails,status)`. |
| Result persistence | READY | Video ID and YouTube URL persist on the shared job row. |
| Upload retry/recovery | READY | Encrypted resumable upload URLs are stored in `youtube_upload_sessions`. |
| Duplicate prevention | READY | Shared idempotency key includes the YouTube approval hash. |

## Governance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Founder approval required | PASS | YouTube jobs use `approveSocialPublishJob` and `publishApprovedJob`. |
| Approval hash includes exact content | PASS | Hash includes video, thumbnail, title, description, tags, visibility, playlist, schedule, and channel. |
| Edits invalidate approval | PASS | Any changed hash fails `assertApprovedExactContent`. |
| Provider identity verified | PASS | Adapter verifies the selected channel is available to the connected account. |
| Upload scopes required | PASS | Health blocks legacy read-only YouTube connections. |
| Duplicate publish prevention | PASS | Existing claim/update/idempotency path is reused. |
| Retry safe after interruption | PASS | Resumable upload session URLs are encrypted and reused on retry. |
| Secrets redacted | PASS | UI and diagnostics never expose tokens, refresh tokens, client secrets, or upload URLs. |
| LinkedIn and X preserved | PASS | This milestone does not modify provider adapter implementations for LinkedIn or X. |

## Founder Actions Required

1. Enable YouTube Data API v3 in the production Google Cloud project.
2. Configure OAuth consent for the required YouTube read/upload/write scopes.
3. Complete Google verification if required for public production usage.
4. Configure the production callback URL:
   `https://<prod-domain>/api/integrations/youtube/callback`.
5. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in production and preview.
6. Set `TOKEN_ENCRYPTION_KEY` before production uploads so resumable upload URLs are encrypted at rest.
7. Confirm quota budget for resumable upload initialization, video upload, thumbnail upload,
   playlist writes, and processing polling.
8. Reconnect YouTube accounts that were authorized with the prior read-only scope.

## Not Implemented

The following remain outside this production publishing milestone:

- YouTube Analytics API.
- Comment moderation or replies.
- Live streams and live broadcast lifecycle.
- Creator Studio synchronization.
- Automatic background scheduler/queue runner beyond sending YouTube `publishAt`.
