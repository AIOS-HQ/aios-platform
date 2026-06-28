# Harmony Autonomy & Approval Boundaries

> The control plane that governs what Harmony may do autonomously vs. what waits
> for founder approval. Encoded in `src/lib/integrations/connectors.ts`
> (per-capability `risk`) + `src/lib/agent/policy.ts`, enforced by
> `connector-runtime.ts`, and surfaced in the **Approval Center**
> (`/settings/approvals`). Every action is owner-scoped and audited in
> `agent_actions`.

## Risk classes

| Class | Behaviour |
|---|---|
| **routine** | Executes autonomously (still owner-scoped + audited). |
| **approval** | Held as a pending action; founder must approve before it runs. |
| **destructive** | Held as pending AND flagged **High risk** / irreversible. |

Default when unspecified: `read → routine`, `write → approval`.

> Execution note: even `routine` capabilities only perform an external call once
> the connector is **configured** (founder credentials present) and its live
> client has shipped. Until then the runtime audits the attempt and reports
> `not_configured` / `not_implemented`. No external mutation occurs without
> credentials, and no `approval`/`destructive` action runs without approval.

## Phase 1 — Founder Stack

**GitHub** — routine: list repos/issues/PRs/branches/workflows, review build result, monitor deployment, create branch, open pull request, create issue · **approval:** merge pull request · **destructive:** delete repository.

**Vercel** — routine: deployment status, production URL verification, build status, env var presence, list deployments, trigger deployment · **destructive:** delete env var.

**Supabase** — routine: db health check, migration verification, public table inspection, RLS diagnostics, monitor database health · **destructive:** destroy database.

## Phase 2 — Content Engine

Creation is autonomous; **external publication always requires approval**; deleting published content is destructive.

**YouTube** — routine: research topic, generate script/metadata/thumbnail · **approval:** publish video, upload short · **destructive:** delete video.

**LinkedIn** — routine: research topic, draft post, generate hashtags · **approval:** publish post · **destructive:** delete post.

**TikTok** — routine: research topic, generate concept/caption · **approval:** publish video · **destructive:** delete video.

## Phase 3 — Chief of Staff

**Gmail** — routine: list messages, categorize, draft response, archive · **approval:** send message (external email).

**Google Calendar** — routine: list events, monitor schedule, create event, resolve conflict, adjust availability · **approval:** cancel external meeting.

**Slack** — routine: list channels, monitor channels, summarize discussion, respond routine, route issue · **approval:** post org-wide announcement.

**Webhooks** — routine: list endpoints, trigger workflow, notify service, send event.

## Global governance

- Every action is **owner-scoped** (RLS), **audited** in `agent_actions`, traceable, and reversible where possible.
- The **Approval Center** distinguishes: routine autonomous (executed/routine), pending approvals, high-risk (destructive), and completed.
- Learning controls remain intact, including `require_approval` for new memories.
- Secrets are never exposed; per-user credentials are stored server-side (service role), never returned to the browser.

## Bounded autonomy controls

The current Founder OS autonomy controls live at `/harmony/autonomy` and are
implemented by `src/lib/workforce/autonomy.ts` and
`src/lib/workforce/autonomy-actions.ts`.

| Control | Meaning |
| --- | --- |
| Off | No autonomous execution. Work can still be proposed, but execution is denied or routed to approval. |
| Advisory | Harmony and agents can recommend work, but founder approval is required before execution. |
| Bounded | Eligible low/medium-risk work can execute only inside category, risk, quota, and restricted-category limits. |
| Low threshold | Allows routine low-risk work only when the global, agent, and category policies all allow it. |
| Medium threshold | Allows low and medium-risk work only when all policy layers allow it; medium-risk execution can notify the founder. |
| Max Actions/Hour | Global hourly cap for auto-executed and auto-plus-notified decisions. `0` disables hourly autonomous execution. |
| Delegation Depth | Maximum nested agent handoffs during an autonomous pass. `0` disables delegation chaining. |
| Daily quota | Per-agent count of `auto_executed` and `notified` decisions since UTC midnight. `0` disables auto-execution for that agent. |
| Monthly quota | Per-agent count of `auto_executed` and `notified` decisions since the first day of the UTC month. `0` disables auto-execution for that agent. |

Restricted categories remain hard-coded approval-only:

- financial
- code
- security
- architecture
- publishing
- destructive

High and critical risk always route to approval. The autonomy pass currently
advances only safe internal work status; external connector mutations still use
the connector policy and approval gates above.

## Remaining founder credential requirements

Set in Vercel (Production + Preview); OAuth callback base `https://<prod-domain>/api/integrations/{id}/callback`.

| Connector | Env vars | Notes |
|---|---|---|
| GitHub | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App; scopes `read:user`, `repo` |
| Gmail + Calendar + YouTube | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud; enable Gmail/Calendar/YouTube APIs |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Slack App |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn app |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok developer app |
| Webhooks | `WEBHOOK_SIGNING_SECRET` | Platform HMAC secret |
| Supabase | none (per-user Management API token via `/settings/diagnostics`) | |
| Vercel | none (per-user access token via `/settings/diagnostics`) | |

Also required to fully activate: apply the four pending migrations
(`memories`, `agent_actions`, `learning_settings`, `learning_require_approval`)
so audit, approvals, and learning persist.

## Pending implementation (gated, not in this control-plane PR)

Live OAuth authorization wiring for GitHub/Google/Slack/LinkedIn/TikTok, the
per-provider API clients, and content generation are gated on founder
credentials and follow as separate PRs. The policy + Approval Center + audit
shipped here make those safe to enable incrementally.
