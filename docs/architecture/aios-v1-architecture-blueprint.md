# AIOS v1 Architecture Blueprint

Last updated: 2026-06-28

## Purpose

AIOS v1 is a shared operating platform for customer-facing Harmony and
founder-facing AIOS operations. The launch architecture intentionally stays
inside one Next.js application and one Supabase-backed data plane so product,
workflow, localization, governance, and diagnostics share the same source of
truth.

## Product surfaces

| Surface | Audience | Purpose | Primary routes |
| --- | --- | --- | --- |
| Public AIOS website | Visitors, prospects, investors, partners | Explain AIOS, Harmony, Julius, workforce, integrations, security, portability, pricing, and product value. | `/`, `/features`, `/ai-workforce`, `/templates`, `/marketplace`, `/pricing`, `/docs`, `/faq`, `/help` |
| Authentication | Visitors/subscribers/founder | Signup, login, password reset, executive feed, locale/theme controls. | `/signup`, `/login`, `/reset-password`, `/update-password` |
| Subscriber Harmony | Subscribers | Unified customer workspace for onboarding, tasks, goals, notes, memory, and Harmony chat. | `/harmony/operator`, `/harmony/onboarding`, `/harmony/tasks`, `/harmony/goals`, `/harmony/notes`, `/settings` |
| Founder OS | Founder/admin | Operating system for AIOS execution, governance, approvals, workforce, diagnostics, public website operations, Subscriber Harmony operations, and code visibility. | `/harmony`, `/harmony/briefing`, `/harmony/operations`, `/harmony/customer-experience`, `/harmony/website`, `/harmony/approvals`, `/harmony/workforce`, `/harmony/autonomy`, `/settings/diagnostics` |

## Core architecture

- **Next.js App Router** owns routing, server rendering, route handlers, and
  server actions.
- **Supabase Auth/Postgres/RLS** owns identity, persisted product data, owner
  scoping, and founder/admin role checks.
- **next-intl** owns English/Spanish message catalogs with cookie-selected
  locale and no URL locale prefix.
- **Tailwind CSS v4 + shadcn-style primitives** own UI consistency.
- **Harmony** is the customer-facing AI Chief of Staff. Customers interact with
  Harmony, while specialist agents and founder-only systems stay behind the
  operating boundary.
- **Founder OS** is admin-gated and exposes workforce, approvals, operations,
  content, code, diagnostics, Subscriber Harmony operations, public website
  operations, and launch monitoring.

## Data and execution layers

| Layer | Existing modules | Notes |
| --- | --- | --- |
| Identity and auth | `src/lib/auth/*`, `src/lib/supabase/*`, `middleware.ts` | Session refresh and protected-route redirects run centrally. |
| Personal OS data | `src/lib/data/tasks.ts`, `goals.ts`, `notes.ts`, `brain.ts` | Subscriber-owned rows with RLS. |
| Founder OS data | `src/lib/data/os/*`, `src/lib/harmony/os/*` | Companies, objectives, departments, approvals, work, events. |
| Workforce | `src/lib/workforce/*`, `src/components/harmony/workforce/*` | Agent registry, recommendations, objectives, autonomy, work queue. |
| Intelligence | `src/lib/harmony/executive-intelligence.ts`, `executive-workspace.ts`, `operational-digital-twin.ts` | Reuses operational data instead of creating parallel analytics stores. |
| Governance | `src/lib/agent/*`, `src/lib/workforce/autonomy.ts`, `docs/governance/*` | Approval-gated execution, kill switch, lockdown, audit history. |
| Integrations | `src/lib/integrations/*` | Connector catalog, diagnostics, OAuth/key connection flows. |
| Observability | `src/lib/observability/*`, `/harmony/operations`, `/settings/diagnostics` | Production readiness, ops events, Vercel/Supabase checks. |
| Customer experience operations | `src/lib/customer-experience/*`, `/harmony/customer-experience` | Aggregate Subscriber Harmony KPIs, privacy controls, synthetic preview, specialist ownership, and customer route readiness. |
| Website operations | `src/lib/website-operations/*`, `/harmony/website` | Public route matrix, analytics setup, SEO/content/performance/reliability readiness. |

## Route protection model

- Public routes remain unauthenticated.
- Auth routes redirect authenticated users into the app.
- App routes require a Supabase session.
- Founder routes under `/harmony` default-deny for non-admin users through
  `isFounderHarmonyPath`.
- Customer Harmony prefixes are explicitly listed in `nav-config.ts`; unknown
  `/harmony/*` routes are founder-only by default.
- `/harmony/customer-experience` and `/harmony/website` are Founder OS routes.
  They show aggregate metrics, readiness, and synthetic previews only; they do
  not expose private subscriber content.

## Launch operations model

1. **Plan**: Founder sets objectives, work, recommendations, and autonomy
   posture.
2. **Execute**: Harmony and the workforce coordinate work through existing work
   queue, A2A messages, approvals, and autonomy decisions.
3. **Review**: Founder reviews blocked work, pending approvals, risk findings,
   and recommendations.
4. **Observe**: Operations and Diagnostics surface runtime events, connector
   health, customer-product KPIs, public website readiness, production
   prerequisites, and deployment readiness.
5. **Learn**: Julius, memory, company skills, and reflection capture reusable
   context for future work.

## Localization and brand model

- All product copy belongs in `messages/*`.
- English and Spanish ship at launch and are checked through
  `npm run i18n:check`.
- The official Harmony v2 logo remains canonical.
- Localized logo lookup is supported by `getHarmonyLogoSrc(locale)` and falls
  back to the canonical official asset until official localized marks exist.

## Launch boundaries

Included in v1:

- Harmony public landing, auth, onboarding, personal workspace, founder command
  center, workforce, approvals, operations, diagnostics, localization, and
  production readiness checks.

Deferred after launch:

- Native mobile apps, marketplace, full Opera Business OS, enterprise tenant
  administration, multi-product app marketplace, and any duplicate analytics or
  workflow systems that bypass the existing Harmony/Founder OS architecture.
