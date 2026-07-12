# LinkedIn Production Readiness

Canonical publishing surface: `/harmony/social`.

LinkedIn publishing uses the existing Social Publishing job pipeline. It is separate from the
LinkedIn Sign-In connector: sign-in uses OpenID Connect for identity only, while external
organization publishing uses the AIOS Publisher app token and the approved organization identity.

## Architecture

- Sign-in OAuth routes: `/api/integrations/linkedin/connect`, `/api/integrations/linkedin/callback`,
  `/api/integrations/linkedin/disconnect`.
- Publisher health API: `/api/integrations/linkedin/publisher-health`.
- Publisher health model: `src/lib/integrations/linkedin-publisher.ts`.
- PDF carousel adapter: `src/lib/social-publishing/adapters/linkedin.ts`.
- Founder approval, idempotency, retry, persistence: `src/lib/social-publishing/jobs.ts`.
- Draft preparation: `src/lib/social-publishing/actions.ts`.
- Test asset: `public/social-drafts/aios-linkedin-carousel.pdf`.
- Publisher status UI: `/settings/connections` and `/harmony/social`.

## Founder Setup Checklist

| Item | Status | Notes |
| --- | --- | --- |
| LinkedIn Sign-In app configured | FAIL | Passes when `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are set. Used only for identity/connector status. |
| LinkedIn callback URL configured | FAIL | Passes when the LinkedIn app allows `https://<prod-domain>/api/integrations/linkedin/callback`. |
| AIOS Publisher app authorized | FAIL | Founder must confirm LinkedIn Community Management API access. |
| Publisher token configured | FAIL | Passes when `LINKEDIN_PUBLISHER_ACCESS_TOKEN` is set. Server-only; never expose in client code. |
| Approved organization configured | FAIL | Passes when `LINKEDIN_ORGANIZATION_URN` or `LINKEDIN_ORGANIZATION_ID` is set. |
| Required LinkedIn permission present | FAIL | Founder must confirm publisher token includes `w_organization_social`; organization read/admin access is required for health verification. |
| LinkedIn API version pinned | NOT APPLICABLE | Optional. Default is `202604`; pin `LINKEDIN_API_VERSION` only after deliberate version review. |

## Production Certification Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Harmony route exists at `/harmony/social` | PASS | Route is built under the authenticated Harmony app shell. |
| Publisher Health distinguishes sign-in and publishing apps | PASS | `LinkedInPublisherHealth` reports `signInConfigured` and `publisherConfigured` separately. |
| Provider organization is verified before publish | PASS | `preflightLinkedInPublisher()` verifies the approved organization and blocks mismatches. |
| Founder approval is required | PASS | `assertApprovedExactContent()` blocks states other than `approved` and retryable `failed`. |
| Approval hash is exact-content bound | PASS | Hash includes provider, content type, caption, target identity, and media checksums. |
| Edits require reapproval | PASS | Publishing fails if `approvedContentHash` differs from `contentHash`. |
| Duplicate publish prevention | PASS | Jobs are claimed atomically before the external LinkedIn call and persisted provider IDs short-circuit retries. |
| Retry behavior is safe | PASS | Failed jobs can retry only when the approved content hash still matches. |
| Result IDs persist | PASS | `provider_post_id` is written after LinkedIn returns `x-restli-id`. |
| Publish URLs persist | PASS | `provider_post_url` is written with the LinkedIn feed update URL. |
| History persists | PASS | `social_publish_jobs` and `activity_events` keep publish status/history. |
| Secrets are redacted | PASS | LinkedIn diagnostics redact bearer tokens and the configured publisher token. |
| Unsupported LinkedIn capabilities stay disabled | PASS | LinkedIn image/video publishing remain false; only text and document carousel are advertised. |
| No mocked success state in production path | PASS | Tests mock fetch; runtime adapter performs real LinkedIn API calls. |
| X and YouTube untouched | PASS | This milestone does not change provider adapters or capability flags for X or YouTube. |

## Founder Actions Before Live Publish

1. Confirm the production domain and LinkedIn Sign-In callback:
   `https://<prod-domain>/api/integrations/linkedin/callback`.
2. Confirm AIOS Publisher has LinkedIn Community Management API access.
3. Generate/refresh the organization publisher token with `w_organization_social`.
4. Set `LINKEDIN_PUBLISHER_ACCESS_TOKEN` in production and preview environments.
5. Set `LINKEDIN_ORGANIZATION_URN` or `LINKEDIN_ORGANIZATION_ID`.
6. Run the LinkedIn Publisher health check in `/settings/connections`.
7. Open `/harmony/social`, prepare the LinkedIn test draft, approve exact content, then publish.
