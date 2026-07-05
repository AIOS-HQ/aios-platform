# AIOS Public Website — Foundation (for Codex continuation)

This is the **architectural foundation** for the public-facing AIOS marketing
website. Hyperagent built the structure; **Codex finishes polish, copy, extra
pages, and refinements.** It is intentionally additive and does **not** touch
`/harmony`, the `(app)` Command Center, the `(auth)` routes, or any schema.

## What exists now

**Route group:** `src/app/(marketing)/` — a Next.js route group (no URL prefix)
with a shared layout that renders the public navbar + footer around every page
in the group. It nests inside the root `app/layout.tsx`, so it never affects the
Command Center (which has its own sidebar layout in `(app)`).

**Shared components:** `src/components/marketing/`
- `public-navbar.tsx` — responsive, **no client JS** (mobile menu uses a native
  `<details>` disclosure). `PUBLIC_NAV_LINKS` is the single source of nav links.
- `public-footer.tsx` — columns + AIOS principles + copyright.
- `sections.tsx` — `MarketingHero`, `Section`, `Card`, `CtaLink` primitives
  (AIOS design tokens: `bg-background`, `text-foreground`, `text-muted-foreground`,
  `primary`, `border`, `rounded-2xl`, Tailwind v4 `bg-linear-to-b`).

**Pages built (new, no collisions):**
| Route | File | Content source |
|---|---|---|
| `/features` | `(marketing)/features/page.tsx` | Curated feature list (static copy) |
| `/marketplace` | `(marketing)/marketplace/page.tsx` | `MARKETPLACE_CATEGORIES` (live, pure) |
| `/ai-workforce` | `(marketing)/ai-workforce/page.tsx` | `AIOS_WORKFORCE` + `JULIUS` (live registry) |
| `/templates` | `(marketing)/templates/page.tsx` | `COMPANY_TEMPLATES` (live, pure) |
| `/docs` | `(marketing)/docs/page.tsx` | Placeholder → FAQ/Help + planned topics |

**Pages reused (already existed — linked, NOT recreated):**
- `/` Home → existing root `src/app/page.tsx` (the landing).
- `/pricing` → existing `src/app/pricing/`.
- `/login`, `/signup` → existing `src/app/(auth)/`.
- `/faq`, `/help` → existing public pages.

CTAs route to **existing** flows: `Get started` → `/signup`, `Log in` →
`/login`, deploy/browse → `/signup` (the authed Company Builder at
`/harmony/build` provisions after login).

## Guardrails honored
- `/harmony` and all existing app routes are **unchanged**.
- **No schema changes**, no secrets, no new env.
- Data pulled from **pure, client-safe** modules only (registry, templates,
  categories, constants) — no DB reads on these public pages.
- Responsive at `sm`/`md`/`lg`.

## TODO(codex) — continuation checklist
1. **Unify chrome for Home + Pricing.** They live outside `(marketing)`. Either
   move `src/app/page.tsx` and `src/app/pricing/` into `(marketing)/` (URLs stay
   the same) so they inherit the navbar/footer, or render `<PublicNavbar/>` +
   `<PublicFooter/>` inside them. Verify the existing landing's own header
   doesn't double up.
2. **i18n.** Extract all inline copy into a `website` per-namespace catalog
   (`messages/website/{en,es}.json`) registered in `src/i18n/request.ts`, mirroring
   the `org`/`marketplace` catalogs. Keep en/es at parity.
3. **Deep-link templates → builder.** `/signup?template=<slug>` (or `next=`)
   and carry the selection into `/harmony/build` after auth.
4. **Real docs.** Replace the `/docs` placeholder with MDX or a docs route tree.
5. **Polish.** Hero imagery/screenshots, feature icons (use confirmed lucide
   icons only), testimonials/logos, an active-link state in the navbar, SEO
   metadata + per-page `opengraph-image`, and a sitemap entry for the new routes.
6. **Legal.** Real Privacy / Terms routes (footer currently points them at `/docs`).
7. **Nav dropdowns.** Consider grouping Product links under a dropdown as the
   nav grows.

## Verification done before this PR
- `tsc --strict` (harness) + ESLint flat config: clean.
- No route collisions (new paths only; existing routes untouched).
- Held for Founder review (visible UX).
