# Phase 6 — Live MCP Connectors: Architecture & Credential Plan

> Status: **IMPLEMENTATION PLAN.** Connector *code* can ship incrementally and
> green without secrets. Provider cards must render truthful setup states such
> as **Configuration required**, **Partial**, **Roadmap**, or **Unsupported**,
> not a fake actionable connector. Making a connector **live** requires
> founder-provided OAuth credentials — see
> [§6 Founder credential matrix](#6-founder-credential-matrix). That is the
> approved stop condition for this phase.

Targets: **GitHub, Gmail, Google Calendar, Slack, Supabase, Webhooks.**

---

## 1. What already exists (reused, not rebuilt)

From the integration framework (PR #7 / #75) and Phase 3 (PR #79):

- **Catalog** — `src/lib/integrations/catalog.ts` (provider metadata, OAuth families, scopes).
- **Config** — `src/lib/integrations/config.ts` (`isProviderConfigured`, reads secrets from env).
- **Persistence** — `integration_connections` table: `access_token`, `refresh_token`,
  `expires_at`, `scopes`, `external_account`; **service-role writes**, **RLS owner-read**,
  token columns **never** selected for the client.
- **Routes** — `/api/integrations/[provider]/{connect,callback,disconnect}`.
- **UI** — provider catalog (`/settings/integrations`) + connection dashboard
  (`/settings/connections`) with reconnect/disconnect.

Gmail, Google Calendar, and YouTube are **already in the catalog** under the
`google` OAuth family. GitHub, Slack, Webhooks, and Supabase are **not yet**.

**Gap to "live":** (a) per-provider OAuth client credentials in env, (b) token
**refresh** + **revoke** (not yet implemented), (c) per-provider API clients +
tools, (d) Webhooks transport + table, (e) a product decision on what "Supabase"
connector means.

---

## 2. Production-safe connector architecture

```
Owner ─▶ /settings/integrations ─▶ /api/integrations/{p}/connect
     authorization-code OAuth        ▲
            ▼                        │ redirect
   provider consent ─▶ /api/integrations/{p}/callback
            │  exchange code → tokens (service role write)
            ▼
   integration_connections (RLS owner-read; tokens never client-exposed)
            │
   getValidAccessToken(userId, provider)  ── refresh if expired ──▶ provider token endpoint
            ▼
   Per-provider API client (server-only)  ── used by ──▶ Phase 2 tool registry
            │                                              (mutating tools: requiresApproval = true)
            ▼
   agent_actions audit + approval gate (human-in-the-loop)
```

**Principles (carried from earlier phases):**

- **Owner-scoped**: every token read/use is keyed to the authenticated user via RLS.
- **Secrets stay server-side**: OAuth client secrets in env; per-user tokens are
  service-role-written and never selected into client-reachable reads.
- **Every external mutation is approval-gated + audited** through Phase 2
  (`executeTool` → `agent_actions`). No silent outbound writes.
- **Least privilege**: request the minimum scopes; disconnect revokes at the provider.

---

## 3. New backend capabilities to build (no founder creds required to ship code)

1. **`getValidAccessToken(userId, provider)`** — returns a usable access token,
   transparently refreshing via the `refresh_token` grant when `expires_at` has
   passed. Per-family refresh (Google/Slack/GitHub). Service-role read of tokens.
2. **Revoke-on-disconnect** — extend `removeConnection` to call the provider's
   token-revoke endpoint before deleting the row.
3. **Per-provider API clients** (server-only) — thin `fetch` wrappers (dependency-free,
   matching the Stripe approach): `github`, `gmail`, `googleCalendar`, `slack`.
4. **Tool registrations** (Phase 2 registry) — e.g. `github.list_issues` (read,
   no approval), `github.create_issue` (mutating, approval), `gmail.send`
   (approval), `calendar.create_event` (approval), `slack.post_message` (approval).
5. **Webhooks transport** — outbound HMAC-signed dispatcher + a per-user inbound
   signed endpoint; requires a new `webhook_endpoints` table (owner-scoped RLS, new
   migration).

These land as small PRs (§5). Until env credentials exist, the providers appear
as configuration-required or roadmap entries, and unsupported tools remain inert
with no fake Connect action.

---

## 4. Security hardening called out for review

- **Token encryption at rest.** Tokens are currently plaintext columns protected
  by RLS + service-role-only writes. For live third-party tokens, recommend
  encrypting `access_token`/`refresh_token` via Supabase Vault or `pgcrypto`.
  *Founder/security decision.*
- **Callback URLs** must be registered per provider against the production domain.
- **Inbound verification.** Slack requires signing-secret verification; webhooks
  require HMAC verification. Secrets in env / per-user.
- **Scope minimization & consent screen review** (Google app verification).

---

## 5. Incremental delivery plan (each PR additive + green)

| PR | Scope | Needs founder creds to *ship*? | Needs creds to go *live*? |
|----|-------|-------------------------------|---------------------------|
| 6a | `getValidAccessToken` refresh + revoke-on-disconnect | No | n/a |
| 6b | GitHub provider (catalog+config) + client + read tool | No | **Yes** |
| 6c | Slack provider + `post_message` (approval) | No | **Yes** |
| 6d | Gmail + Calendar tools (approval) | No | **Yes** (Google app) |
| 6e | Webhooks table + dispatcher + inbound endpoint | No | Platform secret |
| 6f | Supabase connector | **Blocked on product decision** | — |

---

## 6. Founder credential matrix

These are the **only items that require founder action**. Each is an env var set
in Vercel (Production + Preview) plus a provider-side OAuth app. Callback base =
the production domain, e.g. `https://<prod-domain>/api/integrations/{provider}/callback`.

| Provider | Provider-side setup | Env vars | Key scopes |
|---|---|---|---|
| **GitHub** | Create a GitHub OAuth App (or GitHub App for fine-grained perms). Set callback to `/api/integrations/github/callback`. | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | `read:user`, `repo` (or fine-grained repo perms) |
| **Gmail** | Google Cloud project → enable **Gmail API** → OAuth consent screen → OAuth 2.0 **Web** client. Redirect `/api/integrations/gmail/callback`. | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (shared `google` family) | `gmail.readonly`, `gmail.send` |
| **Google Calendar** | Same Google project → enable **Calendar API**. Redirect `/api/integrations/google_calendar/callback`. | (shares the `google` vars above) | `calendar.events` |
| **Slack** | Create a Slack App → OAuth & Permissions. Redirect `/api/integrations/slack/callback`. | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | `chat:write`, `channels:read` (+ as needed) |
| **Webhooks** | No OAuth. Platform-level signing secret; per-user secrets generated by the app. | `WEBHOOK_SIGNING_SECRET` | n/a |
| **Supabase** | **Decision needed** (see §7) before credentials can be specified. | TBD | TBD |

> Note: LinkedIn and TikTok are already in the catalog from PR #7; enabling them
> later follows the same pattern (their own client id/secret env vars).

---

## 7. Open decision — what "Supabase connector" means

"Supabase" is the platform's own database, so a user-facing "connect Supabase"
needs clarification. Most likely intent: let a user connect **their own** Supabase
project to run data tasks. Options:

- **A — API-key connector**: user supplies their project URL + a service key.
  Powerful but stores a highly privileged secret → **must** be encrypted at rest
  and tightly scoped; recommend read-only/anon where possible.
- **B — MCP server connection**: connect to a Supabase MCP endpoint with scoped
  credentials.
- **C — Defer**: ship GitHub/Gmail/Calendar/Slack/Webhooks first; revisit Supabase
  with a clear product spec.

**Recommendation: C** for now; decide A vs B with the security review in §4.

---

## 8. Blockers (approved stop condition)

1. **Founder OAuth credentials** per provider (§6) — required to take any
   connector live. *This is the stop.*
2. **Production domain** confirmation for callback URLs.
3. **Token-encryption decision** (§4).
4. **Supabase connector product decision** (§7).

Connector code (6a–6e) can proceed and merge green without these; **going live**
cannot. On your go-ahead + credentials, 6a ships first (pure backend, no creds),
then providers light up as their env vars land.
