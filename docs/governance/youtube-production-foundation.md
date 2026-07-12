# YouTube Production Foundation

Canonical Harmony surface: `/harmony/social`.

YouTube is a partially implemented integration. This milestone certifies the production foundation
that exists today and documents the missing upload/publishing work without pretending it is complete.

## Architecture Discovered

- OAuth family: `src/lib/integrations/oauth-families.ts` (`google`, shared
  `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`, offline refresh enabled).
- Connector metadata: `src/lib/integrations/connectors.ts` and `src/lib/integrations/catalog.ts`.
- OAuth routes: `/api/integrations/youtube/connect`, `/api/integrations/youtube/callback`,
  `/api/integrations/youtube/disconnect`.
- Connector health: `src/lib/integrations/connector-health.ts`.
- Admin self-test: `/api/admin/integrations/youtube/selftest` using `channels.list(mine=true)`.
- Runtime read handlers: `src/lib/integrations/providers/youtube/index.ts`.
- Harmony Social UI: `/harmony/social`, where YouTube is shown as not publish-ready.
- Publishing pipeline: `src/lib/social-publishing/jobs.ts` exists for LinkedIn/X, but no YouTube
  publish adapter or YouTube social job type is implemented.
- Planning source: `docs/YOUTUBE_MULTI_CHANNEL_IMPLEMENTATION_PLAN.md`.

## Production Gap Analysis

| Area | Status | Notes |
| --- | --- | --- |
| OAuth connection | PARTIAL | Shared Google OAuth flow exists and can authorize `youtube.readonly`. Upload scopes are not requested. |
| Connected account identity | PARTIAL | OAuth stores the connection row; self-test verifies channel identity by calling `channels.list`. |
| Channel discovery | READY | Read-only runtime handlers list/read channels through YouTube Data API `channels.list`. |
| Multiple channel support | PARTIAL | Discovery can return multiple channels, but AIOS does not persist per-channel profiles or selected-channel state. |
| Channel switching | NOT IMPLEMENTED | No UI or persistence for active YouTube channel selection. |
| Video upload | NOT IMPLEMENTED | No resumable upload session, chunk persistence, or YouTube publish adapter exists. |
| Thumbnail upload | NOT IMPLEMENTED | No `thumbnails.set` flow or media validation exists. |
| Metadata | NOT IMPLEMENTED | No title/description/tags/category/language validation for YouTube publishing exists. |
| Visibility | NOT IMPLEMENTED | No private/unlisted/public publish validation exists. |
| Playlists | NOT IMPLEMENTED | No playlist insert/update/list implementation exists. |
| Scheduling | NOT IMPLEMENTED | No scheduled YouTube publish job or `publishAt` validation exists. |
| Shorts | NOT IMPLEMENTED | No Shorts-specific duration/aspect/metadata validation exists. |
| Analytics | NOT IMPLEMENTED | No YouTube Analytics API integration exists. |
| Live streams | NOT IMPLEMENTED | No live broadcast or stream lifecycle implementation exists. |
| Comments | NOT IMPLEMENTED | No comment moderation or reply implementation exists. |
| Creator Studio integration | NOT IMPLEMENTED | No Creator Studio handoff/sync exists. |
| Approval workflow | PARTIAL | Shared exact-content approval exists, but no YouTube draft schema/adapter uses it yet. |
| Approval hash | PARTIAL | Shared hash utility exists, but YouTube metadata/media/channel fields are not wired into a YouTube job. |
| Retry behavior | PARTIAL | Shared job retry exists, but no YouTube resumable upload retry state exists. |
| Duplicate prevention | PARTIAL | Shared idempotency exists, but no YouTube upload idempotency key is generated. |
| Persistence | PARTIAL | `integration_connections` persists OAuth tokens; no YouTube video/channel publish tables exist. |
| Telemetry / audit logging | PARTIAL | Connector runtime telemetry exists for channel reads; no YouTube upload/publish audit events exist. |
| UI | PARTIAL | Harmony Social truthfully reports YouTube as not publish-ready. No channel selector/upload UI exists. |

## Production Certification Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| YouTube is not marked publish-ready | PASS | `/harmony/social` keeps upload and publish false. |
| OAuth uses shared Google connector runtime | PASS | YouTube uses the `google` OAuth family and universal integration routes. |
| Google OAuth requests only current supported scope | PASS | YouTube connector scope is `https://www.googleapis.com/auth/youtube.readonly`. |
| Channel discovery is implemented read-only | PASS | Runtime handlers call `channels.list` for list/read channel workflows. |
| Upload/publish capabilities are not advertised | PASS | YouTube connector capabilities exclude video upload, publish, Shorts upload, thumbnail upload, and delete. |
| Founder approval remains required for external publishing | NOT APPLICABLE | No YouTube external publishing path exists yet. |
| Approval hash cannot be bypassed | NOT APPLICABLE | No YouTube publish job exists yet; LinkedIn/X shared approval path is unchanged. |
| Retry and duplicate publish prevention | NOT APPLICABLE | No YouTube upload/publish job exists yet. |
| Result IDs and URLs persist | NOT APPLICABLE | No YouTube publish result path exists yet. |
| Secrets are redacted | PASS | Connector health and self-test use server-side tokens only and return no token values. |
| LinkedIn and X untouched | PASS | This milestone does not change LinkedIn or X implementation. |

## Founder Actions Required

1. Confirm or create the Google Cloud project for AIOS production.
2. Enable the YouTube Data API v3.
3. Configure the OAuth consent screen and publish/verify it for requested scopes.
4. Configure the production callback URL:
   `https://<prod-domain>/api/integrations/youtube/callback`.
5. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in production and preview environments.
6. Confirm quota budget for channel discovery now and resumable upload later.
7. Connect each Founder-owned YouTube or Brand Account channel separately once multi-channel support is implemented.
8. Before upload work begins, approve the future scope expansion to
   `https://www.googleapis.com/auth/youtube.upload` or a broader write scope only if required.

## Future Roadmap

1. Persist selected YouTube channel identities and per-channel profiles.
2. Add a YouTube draft type that hashes exact title, description, visibility, channel ID,
   schedule, thumbnail checksum, and video checksum.
3. Add media validation for long-form video and Shorts.
4. Implement resumable video upload with chunk retry/progress persistence.
5. Implement thumbnail upload, metadata update, playlists, schedule validation, and result persistence.
6. Add YouTube-specific approval, idempotency, telemetry, and production acceptance tests before enabling publish.
