# Subscriber Harmony Product Runbook

Subscriber Harmony is the authenticated customer product inside AIOS. It is not
the public marketing website and it is not Founder OS.

## Product Surfaces

| Surface | Audience | Purpose |
| --- | --- | --- |
| Public AIOS website | Visitors, prospects, investors, partners | Explain AIOS, Harmony, Julius, workforce, integrations, security, portability, pricing, and product value. |
| Subscriber Harmony | Authenticated customers/subscribers | Private Personal Operating System powered by Harmony. |
| Founder OS | Founder/admin | Operate AIOS, public website, Subscriber Harmony, workforce, integrations, releases, security, approvals, and business operations. |

## Subscriber Routes

| Route | Purpose | Privacy |
| --- | --- | --- |
| `/harmony/operator` | Harmony operator/chat workspace. | Owner-scoped. |
| `/harmony/personal` | Personal dashboard. | Reads only signed-in user's tasks, goals, notes. |
| `/harmony/onboarding` | Guided setup. | Current completion state is not durably tracked. |
| `/harmony/tasks` | Personal task workflow. | RLS owner-scoped. |
| `/harmony/goals` | Personal goals. | RLS owner-scoped. |
| `/harmony/notes` | Private notes. | Founder dashboards never show note content. |
| `/settings/memory` | Personal memory. | Owner-scoped. |
| `/settings/learning` | Learning controls. | Owner-scoped. |
| `/settings/activity` | Activity view. | Owner-scoped. |
| `/settings/approvals` | Subscriber approval center. | Owner-scoped. |
| `/settings/integrations` | Personal integrations. | Connection state only; no tokens. |
| `/settings/connections` | Connection health/disconnect controls. | Tokens are never displayed. |
| `/settings/diagnostics` | Subscriber diagnostics. | Safe status only. |

## Founder Customer Experience Routes

| Route | Purpose |
| --- | --- |
| `/harmony/customer-experience` | Aggregate Subscriber Harmony operations dashboard. |
| `/harmony/customer-experience/preview` | Synthetic, non-mutating customer preview. |
| `/harmony/customer-experience/journey` | Visitor-to-subscriber journey. |
| `/harmony/customer-experience/analytics` | Privacy-conscious KPI dashboard. |
| `/harmony/customer-experience/reliability` | Customer-facing reliability indicators. |
| `/harmony/customer-experience/feedback` | Feedback/support setup status. |
| `/harmony/customer-experience/releases` | Subscriber-impacting release status. |

## KPI Sources

KPIs use existing durable records where possible:

- `profiles`: registered customers and saved profile photos.
- `personal_tasks`: task creation/completion and activity proxy.
- `personal_goals`: goal creation and activity proxy.
- `personal_notes`: note creation and activity proxy; note contents are not read.
- `personal_brains`: memory record count only.
- `integration_connections`: connected integration count and activity proxy; no token values.
- `subscriptions`: billing conversion status when Stripe is configured.
- `ops_events`, `agent_actions`, Event Mesh summary: reliability metadata.

Not tracked yet:

- durable onboarding completion;
- verified account conversion through Supabase Auth aggregate logs;
- CTA click analytics;
- waitlist persistence;
- cohort retention beyond durable activity proxies.

## Privacy Controls

- Founder dashboards aggregate by default.
- Private notes, memories, prompts, messages, files, and customer content are not queried for KPI display.
- Preview mode is synthetic and does not impersonate a customer.
- Support drill-downs must be authorized, audited, and limited to support need.
- Personal integrations remain owned by the subscriber unless a separate company-owned connection is explicitly configured.

## Specialist Ownership

- Harmony orchestrates customer operations and routes specialist work.
- Pulse monitors uptime, failures, route health, and customer-impacting incidents.
- Auditor audits route coverage, accessibility, broken links, SEO, onboarding, permissions, and readiness.
- Catalyst owns public copy, subscriber education, onboarding copy, and conversion improvements.
- Mason implements approved corrections through PR/preview workflows only.
- Horizon tracks activation, adoption, goals, roadmap progress, and product opportunities.
- Aegis monitors access boundaries, upload safety, form security, and privacy risk.
- Atlas keeps help, onboarding knowledge, docs, and Julius context accurate.
- Ambassador coordinates authorized support and WhatsApp Business channels.
- Ledger records releases, incidents, approvals, experiments, and outcomes.

## Production Activation

Before claiming full production activation:

1. Verify all migrations in the production AIOS Supabase project.
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set for aggregate dashboards.
3. Persist onboarding completion if onboarding completion rate is required.
4. Configure a lawful analytics provider before showing visitors, page views, or conversion rates.
5. Verify profile photo storage policies and signed reads with Founder and subscriber accounts.
6. Verify Vercel preview/production access for visual acceptance.
