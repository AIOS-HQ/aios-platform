# YouTube Multi-Channel Implementation Plan

This document is intentionally planning-only. YouTube upload and publishing are not implemented in tonight's LinkedIn/X publishing milestone.

## Target Model

- Three separately authorized personal YouTube channels.
- One encrypted refresh token per channel in `integration_connections`.
- Stored channel ID, channel title, handle when available, and verified account identity.
- Separate weekly schedules per channel.
- Per-channel content profiles for tone, audience, format, and CTA.
- Founder approval for every upload or schedule change.
- Duplicate prevention through social publishing job idempotency keys.
- Quota tracking and clear quota-exceeded errors.

## Required Future OAuth

Current Google OAuth can support read flows. Upload requires a future scoped authorization pass and must not be requested tonight.

Future scope requirements should be reviewed against current Google/YouTube docs before implementation:

- YouTube channel identity read scope.
- YouTube video upload scope.
- Refresh-token support for each channel connection.

## Future Publishing Flow

1. Verify the connected Google account.
2. Verify the selected YouTube channel ID and title.
3. Validate media as a Short:
   - vertical 9:16;
   - duration within current YouTube Shorts limits;
   - supported video MIME/codec;
   - title, description, tags, privacy status.
4. Create a Founder-preview social publishing job.
5. Require approval for the exact title, description, metadata, media checksum, channel, and schedule.
6. Initialize resumable upload.
7. Upload chunks with retry and progress persistence.
8. Persist video ID, URL, upload status, processing status, timestamps, and redacted errors.
9. Prevent duplicate uploads on retry.

## Current Honest Capability Flags

- `readChannel`: based on current implementation only.
- `readVideos`: based on current implementation only.
- `uploadVideo`: false.
- `publishVideo`: false.
- `publishShort`: false.

## Blockers Before Implementation

- Confirm approved Google OAuth app can request upload scopes.
- Confirm Vercel production env contains the correct Google OAuth credentials.
- Confirm the Founder authorizes each personal channel separately.
- Confirm API quota availability for resumable uploads and status polling.
