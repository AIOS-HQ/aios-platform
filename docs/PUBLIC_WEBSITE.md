# AIOS Public Website Certification

This is the authoritative public website route and content matrix for the AIOS
platform. Public routes must stay truthful to current product capabilities:
Harmony is the operating interface, Julius is the organizational brain, and the
AIOS workforce operates under approval and connector-readiness boundaries.

## Public Information Architecture

Primary public navigation:

- Home: `/`
- Features: `/features`
- AI Workforce: `/ai-workforce`
- How It Works: `/#automation`
- Integrations: `/#integrations`
- Company Templates: `/templates`
- Marketplace: `/marketplace`
- Pricing: `/pricing`
- Docs: `/docs`
- Login: `/login`
- Get Started: `/signup` or `/#waitlist` on the landing page

Protected application routes remain excluded from public navigation. `/harmony`,
`/settings`, and `/api` remain protected or non-public.

## Route Matrix

| Route | Purpose | Public/protected | Status | CTA source | Metadata | Mobile | EN/ES |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Investor/customer landing page for AIOS, Harmony, Julius, workforce, integrations, approvals, portability, and early access. | Public | Complete | Waitlist, pricing, docs, login | Page metadata + OG/X card | Responsive | EN/ES via `messages/landing/*` |
| `/#automation` | How AIOS moves from request to governed work. | Public anchor | Complete | Landing nav, public nav | Inherited from `/` | Responsive | EN/ES |
| `/#integrations` | Truthful integration overview without claiming framework-only providers are production-ready. | Public anchor | Complete | Landing nav, public nav | Inherited from `/` | Responsive | EN/ES |
| `/features` | Product capability overview. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/ai-workforce` | AIOS workforce overview from the canonical registry, with Julius described as the brain, not an agent. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/templates` | Company template catalogue backed by current template data. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/marketplace` | Public marketplace categories and readiness. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/docs` | Public documentation index for getting started, Harmony, workforce, approvals, integrations, security, and portability. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/pricing` | Founder Beta pricing and billing entry point. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/faq` | Public FAQ. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/help` | Public help center. | Public | Complete | Public nav/footer | Static metadata | Responsive | English static copy |
| `/privacy` | Public privacy terms. | Public | Complete | Footer, sitemap | Static metadata | Responsive | English static copy |
| `/terms` | Public legal terms. | Public | Complete | Footer, sitemap | Static metadata | Responsive | English static copy |
| `/login` | Auth entry. | Public auth | Complete | Nav/footer | Auth metadata | Responsive | App auth copy |
| `/signup` | Founder/customer account creation. | Public auth | Complete | Nav/footer | Auth metadata | Responsive | App auth copy |

## Claim Boundaries

- The website must not claim unlimited or ungated autonomy.
- Social publishing is real for LinkedIn, X, and YouTube only through Harmony
  Social governance and provider readiness.
- Framework-only integrations remain described as setup/configuration work, not
  production execution.
- No fake customer counts, revenue, testimonials, partner logos, or live
  analytics are used.
- AirBid is not presented as part of the AIOS workforce or brand.

## SEO and Indexing

- `src/app/sitemap.ts` lists public routes only.
- `src/app/robots.ts` allows public routes and disallows `/harmony`,
  `/settings`, and `/api`.
- Protected authenticated routes stay out of public navigation and sitemap.
- Default site URL should be set with `NEXT_PUBLIC_SITE_URL` in production so
  canonical sitemap/robots URLs use the production domain.

## Acceptance Checks

- Desktop and mobile public nav expose the same main public destinations.
- Every public nav/footer link resolves to an existing route or landing anchor.
- Public pages do not require authentication.
- Public copy distinguishes current implemented capabilities from future setup.
- The canonical one-mark `AiosHarmonyLogo` is used for public chrome.
