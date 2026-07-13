# Integration Center Production Certification

Verified against main after YouTube production publishing merge `afb82e9dda21027e97c6b2a02f41aa09b1c872b0`.

The Integration Center is the global account, credential, identity, readiness, and diagnostics surface. Harmony Social remains the content preparation, approval, publishing, and result surface. This document is the current provider inventory and production certification source.

## Classification Rules

| Status | Meaning |
| --- | --- |
| PRODUCTION READY | Real authentication, identity, capability execution, health, diagnostics, and tests exist. |
| PARTIAL | Some real capabilities exist, but important workflow pieces remain incomplete. |
| READ ONLY | Real read or identity capability exists; write/publish behavior is unavailable in the Integration Center. |
| CONFIGURATION REQUIRED | Implementation exists, but credentials, scopes, connection, or external setup are missing. |
| REAUTHORIZATION REQUIRED | Stored credentials are expired, invalid, insufficiently scoped, or legacy. |
| FRAMEWORK ONLY | Catalog metadata or OAuth scaffolding exists without meaningful runtime capability. |
| UNSUPPORTED | No usable implementation exists and execution is disabled. |

## Provider Inventory

| Provider | Auth | Identity | Implemented capabilities | Missing or disabled capabilities | Health and self-test | Final classification | Founder actions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub | OAuth, `github` family | OAuth account from connection row and self-test | Repos, issues, PRs, branches, branch creation, issue creation, PR creation, file commit, merge approval gate, repository delete destructive gate | Workflow/build/deployment read claims remain unimplemented handlers | Normalized health plus live `/user` self-test | CONFIGURATION REQUIRED until connected; PRODUCTION READY when configured, connected, scoped, and token-valid | Set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`; connect account |
| Vercel | API key metadata | None | None in connector runtime | Deployments, build status, env var checks, trigger deployment | No safe provider health adapter yet | FRAMEWORK ONLY | Build bounded Vercel health adapter and credential model before presenting as functional |
| Supabase | API key metadata | None | None in connector runtime | DB health, migration verification, RLS diagnostics | No safe provider health adapter yet | FRAMEWORK ONLY | Build Supabase health adapter and safe service-role diagnostics before presenting as functional |
| YouTube | OAuth, Google family | Connected channel identity; live channel self-test | Channel read, playlist read, processing poll through connector runtime; video upload, thumbnail upload, metadata, visibility, scheduling, Shorts, channel selection, playlist selection through Harmony Social governance | None when required Google scopes are granted | Normalized health, required-scope blockers, live `channels.list(mine)` self-test | CONFIGURATION REQUIRED until Google OAuth, scopes, and connection are complete; PRODUCTION READY when connected with upload scopes | Enable YouTube Data API, OAuth consent, upload/force-ssl scopes, quota, callback URL, channel access |
| LinkedIn Sign-In | OAuth, LinkedIn family | OpenID profile identity | Profile and identity verification | Publishing is intentionally separate | Normalized health plus live OpenID self-test | READ ONLY when connected; CONFIGURATION REQUIRED until LinkedIn OAuth is configured | Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`; connect account |
| LinkedIn Publisher | Dedicated publisher app | Organization/member identity from publisher health | Text post and document carousel via Harmony Social, Founder approval, exact-content hash, idempotency, result persistence | Unsupported LinkedIn capabilities remain disabled | Publisher health card and Social provider health | PRODUCTION READY when publisher credentials, organization, and health pass | Maintain LinkedIn app scopes, organization access, callback URL |
| X | OAuth, X family | Account from OAuth row and live users.me self-test | Text post, single image post, multi-image post through Harmony Social governance | Timeline read and video post are not implemented | Normalized health plus live users.me self-test | PARTIAL in Integration Center; PRODUCTION READY for certified Harmony Social text/image publishing when configured and connected | X Developer Portal callback, OAuth scopes, elevated/media access, env vars |
| TikTok | OAuth metadata | None | None | Research/concept/caption/publish/delete claims have no runtime | No self-test | FRAMEWORK ONLY | Implement OAuth flow, scopes, runtime handlers, and governance before enabling |
| Gmail | OAuth, Google family | Gmail profile self-test | List messages runtime handler | Categorize, draft, archive, send handlers incomplete | Normalized health plus live Gmail profile self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Gmail scopes, callback URL |
| Google Calendar | OAuth, Google family | Calendar list self-test | List events runtime handler | Monitor, create, conflict resolution, availability, cancellation handlers incomplete | Normalized health plus live calendar list self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Calendar scopes, callback URL |
| Google Drive | OAuth, Google family | Drive about.user self-test | List files runtime handler | Upload/delete handlers incomplete | Normalized health plus live Drive self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Drive scope, callback URL |
| Google Workspace | OAuth, Google family | Connection row only | None | Directory user/org unit handlers absent | Normalized health only | FRAMEWORK ONLY | Implement Admin SDK read handlers and scoped OAuth certification |
| Google Docs | OAuth, Google family | Connection row only | Registry/runtime scaffolding present; no live self-test | Create/edit coverage needs certification | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Docs scopes, callback URL |
| Google Sheets | OAuth, Google family | Connection row only | Registry/runtime scaffolding present; no live self-test | Append/update coverage needs certification | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Sheets scopes, callback URL |
| Google Meet | OAuth, Google family | Connection row only | Registry/runtime scaffolding present; no live self-test | Meeting creation coverage needs certification | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until Google OAuth and connection exist | Google OAuth credentials, Meet scopes, callback URL |
| Microsoft 365 | OAuth, Microsoft family | Connection row only | None | Profile/read behavior absent | Normalized health only | FRAMEWORK ONLY | Register Microsoft OAuth app, scopes, callback URL, runtime handlers |
| Outlook | OAuth, Microsoft family | Connection row only | None | Mail read/draft/send handlers absent | Normalized health only | FRAMEWORK ONLY | Register Microsoft OAuth app, mail scopes, callback URL, runtime handlers |
| Outlook Calendar | OAuth, Microsoft family | Connection row only | None | Event read/create/cancel handlers absent | Normalized health only | FRAMEWORK ONLY | Register Microsoft OAuth app, calendar scopes, callback URL, runtime handlers |
| Microsoft Teams | OAuth, Microsoft family | Connection row only | None | Channel read/post handlers absent | Normalized health only | FRAMEWORK ONLY | Register Microsoft OAuth app, Teams scopes, callback URL, runtime handlers |
| OneDrive | OAuth, Microsoft family | Connection row only | None | File read/upload/delete handlers absent | Normalized health only | FRAMEWORK ONLY | Register Microsoft OAuth app, Files scopes, callback URL, runtime handlers |
| Slack | OAuth, Slack family | Live auth.test self-test | List channels runtime handler | Monitor, summarize, respond, route, announcement handlers incomplete | Normalized health plus live Slack self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Slack app settings exist | Set Slack client/signing secrets, scopes, callback URL |
| Discord | OAuth, Discord family | Live users.me self-test | List guilds runtime handler | Message posting handler incomplete | Normalized health plus live Discord self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Discord app settings exist | Discord OAuth app, scopes, callback URL |
| Notion | OAuth, Notion family | Live users.me self-test | Search/read/create/update handlers registered | Needs production certification before broad automation | Normalized health plus live Notion self-test | PARTIAL when connected; CONFIGURATION REQUIRED until Notion app settings exist | Notion OAuth app, callback URL, workspace access |
| Linear | OAuth, Linear family | Connection row only | List/create/update issue handlers registered | No live self-test yet | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until Linear app settings exist | Linear OAuth app, scopes, callback URL |
| Jira | OAuth, Atlassian family | Connection row only | Handler module present for Jira issue workflows | Cloud site discovery and self-test remain incomplete | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until Atlassian app settings exist | Atlassian OAuth app, scopes, callback URL, cloud ID handling |
| HubSpot | OAuth, HubSpot family | Connection row only | List contacts runtime handler | Create/delete handlers incomplete | Normalized health only | PARTIAL when connected; CONFIGURATION REQUIRED until HubSpot app settings exist | HubSpot app, scopes, callback URL |
| Salesforce | OAuth, Salesforce family | Connection row only | None | Query/create/delete handlers absent | Normalized health only | FRAMEWORK ONLY | Salesforce connected app, scopes, runtime handlers |
| Shopify | OAuth family metadata | Connection row only | None | OAuth endpoints are not complete; product/order handlers absent | Connect gate blocks until configured | FRAMEWORK ONLY | Complete Shopify shop-specific OAuth and runtime handlers |
| Stripe | OAuth metadata | None | None | Connect OAuth and payment/customer handlers absent | Normalized health only | FRAMEWORK ONLY | Stripe Connect app, scopes, runtime handlers |
| QuickBooks | OAuth metadata | None | None | Accounting handlers absent | Normalized health only | FRAMEWORK ONLY | Intuit app, scopes, runtime handlers |
| WhatsApp Business | API key / Meta Cloud API environment | Business account and phone-number identity through Cloud API self-tests when configured | Webhook verification, signed webhook validation, inbound text/media metadata/status normalization, duplicate webhook suppression, safe conversation/message metadata persistence, business/phone verification, template listing, governed text/template/media send handlers | Live send requires Meta app, WhatsApp Business Account, approved phone number, valid token, templates, opt-in, and service-window/approval policy; no personal WhatsApp or WhatsApp Web support | Normalized configuration health plus Cloud API identity/template self-tests when credentials are present | CONFIGURATION REQUIRED; PARTIAL runtime foundation when configured until live production acceptance is completed | Configure Meta app, callback URL, `WHATSAPP_*` env vars, webhook subscription, WABA/phone access, approved templates, consent process |
| Instagram | OAuth metadata | None | None | Publishing/insights handlers absent | Normalized health only | FRAMEWORK ONLY | Meta app, scopes, runtime handlers |
| Facebook Messenger | OAuth metadata | None | None | Messenger handlers absent | Normalized health only | FRAMEWORK ONLY | Meta app, page permissions, runtime handlers |
| Dropbox | OAuth, Dropbox family | Connection row only | None | File handlers absent | Normalized health only | FRAMEWORK ONLY | Dropbox app, scopes, runtime handlers |
| Box | OAuth, Box family | Connection row only | None | File handlers absent | Normalized health only | FRAMEWORK ONLY | Box app, scopes, runtime handlers |
| Twilio | API key metadata | None | None | SMS read/send handlers absent | No provider-specific health adapter | FRAMEWORK ONLY | Add API-key credential storage, health adapter, governed SMS runtime |
| Webhooks | Webhook metadata | None | None | Endpoint registry and signing runtime absent | No provider-specific health adapter | FRAMEWORK ONLY | Set `WEBHOOK_SIGNING_SECRET`; implement endpoint registry |
| OpenAI | API key metadata | None | None in connector runtime | Model capability execution handled outside Integration Center | No provider-specific health adapter | FRAMEWORK ONLY | Add safe key presence and model diagnostics before showing as connected |
| Anthropic | API key metadata | None | None | Model capability execution absent in connector runtime | No provider-specific health adapter | FRAMEWORK ONLY | Add safe key presence and model diagnostics |
| Gemini | API key metadata | None | None | Model capability execution absent in connector runtime | No provider-specific health adapter | FRAMEWORK ONLY | Add safe key presence and model diagnostics |
| Office devices | Local/device metadata | Local device identity not implemented | None | Discovery and device command runtime absent | Device glyph fallback only | FRAMEWORK ONLY | Implement local discovery and safe device execution |

## Token Encryption and Credential Safety

| Check | Result |
| --- | --- |
| Access token reads | PASS. Display reads exclude token columns. Health reads token values only server-side to derive booleans and encryption state. |
| Refresh token reads | PASS. Refresh-token presence is derived server-side; values are never returned. |
| At-rest encryption | PASS for new OAuth writes through `encryptToken`. Legacy plaintext is detected as `plaintext_token`. |
| Backfill | PASS. Founder/admin-only `POST /api/admin/encrypt-tokens` is idempotent and returns counts only. |
| Missing encryption key | CONFIGURATION REQUIRED. Set `TOKEN_ENCRYPTION_KEY` before production backfill. |
| Secret redaction | PASS. Health, diagnostics, self-tests, and runtime errors redact sensitive patterns. |
| Disconnect | PASS. `removeConnection` deletes the owner/provider row. |

## Logo Certification

Integration cards now use the shared `ConnectorGlyph` component backed by local brand assets in `src/components/brand/brand-icons.tsx`. No card hotlinks third-party images. Official or locally embedded brand treatment exists for Google/Gmail/Calendar/Drive/YouTube, Microsoft/Outlook/Teams/Office, LinkedIn, X, GitHub, Vercel, Supabase, Slack, Stripe, WhatsApp, Instagram, Messenger, Dropbox, Box, Discord, Notion, Linear, Atlassian/Jira, HubSpot, Salesforce, Shopify, QuickBooks, OpenAI, Anthropic, Gemini, TikTok, and Twilio.

Approved fallback logos remain only for custom/non-brand surfaces: Webhooks and local office devices.

## Branding Certification

The canonical app chrome uses `AiosHarmonyLogo`. Auth and onboarding screens no longer render standalone `HarmonyMark` elements beside that lockup. `HarmonyAvatar` remains preserved for chat, operator, Ask Harmony, awareness, and guided interaction surfaces.

## Migration Status

The social publishing migrations still need production verification before a live production publish:

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
```

Confirm these migrations are applied in the production project:

- `20260712000000_social_publishing_jobs.sql`
- `20260712010000_youtube_production_publishing.sql`
- `20260713000000_event_mesh.sql`
- `20260713010000_profile_photo_path.sql`
- `20260713020000_whatsapp_business_foundation.sql`

Validation query after application:

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
where version in (
  '20260712000000',
  '20260712010000',
  '20260713000000',
  '20260713010000',
  '20260713020000'
)
order by version;
```

Do not run production migrations from an unverified environment.

## Consolidated Follow-Up

Open one follow-up workstream for metadata-only connectors before marking them functional: Vercel, Supabase, Microsoft 365/Outlook/Teams/OneDrive, Instagram, Facebook Messenger, Stripe, QuickBooks, Dropbox/Box, Twilio, Webhooks, OpenAI/Anthropic/Gemini, and office devices. Each workstream needs a credential model, safe health adapter, identity verification, runtime handlers, governance tests, and production documentation. WhatsApp Business now has a bounded official Cloud API foundation but remains configuration-gated until Founder supplies and validates Meta production credentials.
