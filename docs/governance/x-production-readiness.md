# X Production Readiness

Canonical publishing surface: `/harmony/social`.

X publishing uses the existing Social Publishing job pipeline. It publishes through the connected
X OAuth account only after Founder approval of the exact caption and media set.

## Architecture

- OAuth routes: `/api/integrations/x/connect`, `/api/integrations/x/callback`,
  `/api/integrations/x/disconnect`.
- OAuth family: `src/lib/integrations/oauth-families.ts` (`X_OAUTH_CLIENT_ID`,
  `X_OAUTH_CLIENT_SECRET`, PKCE enabled).
- Connector scopes and capabilities: `src/lib/integrations/registry.ts`.
- Connector health: `src/lib/integrations/connector-health.ts`.
- X adapter: `src/lib/social-publishing/adapters/x.ts`.
- Founder approval, idempotency, retry, persistence: `src/lib/social-publishing/jobs.ts`.
- Draft preparation: `src/lib/social-publishing/actions.ts`.
- Test assets: `public/social-drafts/x-multi-image-*.png`.
- Publisher status UI: `/settings/connections` and `/harmony/social`.

## Founder Setup Checklist

| Item | Status | Notes |
| --- | --- | --- |
| X Developer app created | FAIL | Founder must create or confirm the production X app. |
| OAuth client configured | FAIL | Passes when `X_OAUTH_CLIENT_ID` and `X_OAUTH_CLIENT_SECRET` are set. |
| X callback URL configured | FAIL | Production app must allow `https://<prod-domain>/api/integrations/x/callback`. |
| Required X scopes configured | FAIL | App authorization must include `tweet.read`, `tweet.write`, `users.read`, `media.write`, and `offline.access`. |
| Production X account connected | FAIL | Founder must connect the exact publishing account from Harmony Integrations. |
| X API access tier confirmed | FAIL | Founder must confirm the app tier allows post creation and media upload within expected rate limits. |
| Token encryption enabled | FAIL | Passes when `TOKEN_ENCRYPTION_KEY` is set and token backfill has run for any plaintext rows. |

## Production Certification Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Harmony route exists at `/harmony/social` | PASS | X is exposed inside the native Harmony Social module. |
| OAuth uses the shared connector runtime | PASS | X OAuth is defined in the OAuth family registry with PKCE and the canonical X env vars. |
| Provider account is verified before publish | PASS | `xPublishingAdapter.verifyAccount()` calls `/2/users/me` and matches id, username, or `@username` to the approved target. |
| Connector health blocks unconfigured or disconnected X | PASS | `getProviderHealth(userId, "x")` reports setup, connection, token, and scope state. |
| Text publishing | PASS | `createXTweet()` posts to `/2/tweets` without a media payload when no media ids exist. |
| Single image publishing | PASS | The adapter uploads one ready image and attaches the returned media id to the tweet payload. |
| Multi-image publishing | PASS | The adapter uploads up to four images and sends all returned media ids in one tweet payload. |
| Video publishing | NOT APPLICABLE | `videoPost` remains false and is not advertised as available. |
| Media processing polling | NOT APPLICABLE | Current supported X image flow does not implement async video/GIF processing. |
| Founder approval is required | PASS | `assertApprovedExactContent()` blocks states other than `approved` and retryable `failed`. |
| Approval hash is exact-content bound | PASS | Hash includes provider, content type, caption, target identity, and media checksums. |
| Edits require reapproval | PASS | Publishing fails if `approvedContentHash` differs from `contentHash`. |
| Duplicate publish prevention | PASS | Jobs are claimed atomically before the external X call and persisted provider IDs short-circuit retries. |
| Retry behavior is safe | PASS | Failed jobs can retry only when the approved content hash still matches. |
| Result IDs persist | PASS | `provider_post_id` is written from the X post creation response. |
| Tweet URLs persist | PASS | `provider_post_url` is written as the X status URL. |
| History persists | PASS | `social_publish_jobs` and `activity_events` keep publish status/history. |
| Errors are surfaced | PASS | Adapter and job errors are redacted, saved to `last_error`, and shown in Harmony Social. |
| Secrets are redacted | PASS | Error and diagnostics paths use shared secret redaction and never return OAuth token values. |
| No mocked success state in production path | PASS | Tests mock fetch; runtime adapter performs real X API calls. |
| Unsupported capabilities stay disabled | PASS | X video publishing remains false. YouTube publishing is now covered by its own production certification. |
| LinkedIn and YouTube scoped separately | PASS | This milestone did not change LinkedIn; YouTube production work is documented in its own certification. |

## Founder Actions Before Live Publish

1. Confirm the production domain and X callback:
   `https://<prod-domain>/api/integrations/x/callback`.
2. Confirm the X Developer app has OAuth 2.0 user-context access with PKCE.
3. Configure the app scopes: `tweet.read`, `tweet.write`, `users.read`, `media.write`,
   and `offline.access`.
4. Set `X_OAUTH_CLIENT_ID` and `X_OAUTH_CLIENT_SECRET` in production and preview environments.
5. Confirm the production X API tier supports post creation and media upload at expected volume.
6. Ensure `TOKEN_ENCRYPTION_KEY` is configured and token backfill has run for existing connection rows.
7. Connect the production X account in Harmony Integrations.
8. Open `/harmony/social`, prepare the X test draft, approve exact content, then publish.
