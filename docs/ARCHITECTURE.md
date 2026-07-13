# AIOS Architecture

This document describes how the AIOS Platform is structured and the decisions behind it.
For the launch-specific v1 blueprint, see
[`docs/architecture/aios-v1-architecture-blueprint.md`](architecture/aios-v1-architecture-blueprint.md).

## Overview

AIOS is a **shared-platform architecture**. A single Next.js application contains:

- **AIOS Core** — shared foundation: identity/auth, user profiles, roles, settings, UI system,
  localization, theming, and the Supabase data layer.
- **Harmony** — the Personal Operating System, built on top of AIOS Core.
- **Opera** — the Business Operating System _(future phase, not in this build)._

Products live in their own route groups and feature folders but reuse Core's components,
data clients, i18n, and conventions. This keeps the codebase modular without premature
microservice complexity.

Harmony Social is a native Harmony module at `/harmony/social`. It uses the existing Harmony
layout and navigation, keeps external publishing Founder-approved, and supports production
LinkedIn, X, and YouTube publishing. YouTube publishing includes multi-channel selection,
video/Short upload, thumbnails, visibility, scheduling, playlists, progress, recovery, and
provider result persistence through the shared Social publishing governance pipeline.

The AIOS Workforce is certified through `src/lib/workforce/certification.ts`, with
`src/lib/workforce/registry.ts` remaining the named-agent source of truth. The certification
layer exposes each agent's real runtime handlers, Julius access, connector dependencies,
approval/autonomy boundaries, blockers, and unsupported capabilities to the Workforce UI and
tests. Julius remains the company-scoped organizational brain, not an agent.

The portable AIOS Event Mesh lives in `src/lib/event-mesh`. PostgreSQL/Supabase is
the authoritative outbox, delivery, retry, dead-letter, and replay ledger. NATS
JetStream is an optional replaceable real-time transport behind the same
provider-neutral contract; workforce code does not depend on NATS, Azure, Google
Pub/Sub, or any cloud-specific messaging SDK.

## Guiding principles (engineering implications)

| Principle | How it shows up in code |
| --- | --- |
| Human in control | No destructive automation. AI suggests; the user confirms. |
| Trust before automation | The Life Operator defaults to a transparent mock; real AI is opt-in via env. |
| Global first | All strings come from `messages/*`. No hardcoded copy. |
| Accessibility first | Semantic HTML, focus management, labels, contrast, reduced-motion. |
| Users own their data | Row Level Security scopes every row to its owner; export/delete are first-class goals. |

## Folder structure

```
src/
  app/
    (auth)/           # public auth routes: login, signup, reset/update password
    (app)/            # protected, authenticated shell (Harmony + settings)
    auth/             # auth route handlers (callback, sign-out)
    layout.tsx        # root layout: theme, i18n provider, skip link, toaster
    page.tsx          # marketing landing
  components/
    ui/               # shadcn/ui-style primitives (button, card, dialog, …)
    brand/            # logo + brand lockups
    app/              # app shell: sidebar, topbar, nav, user menu
    auth/             # auth forms
    harmony/          # Harmony feature components
  i18n/               # config, request resolver, server actions
  lib/
    supabase/         # client.ts (browser), server.ts (RSC/actions), middleware.ts
    auth/             # auth actions + user/session helpers
    data/             # typed data-access functions per table
    harmony/          # Harmony server actions + domain logic
    ai/               # Life Operator provider abstraction (mock/openai/anthropic)
  types/              # shared TypeScript types (database row types)
messages/             # en.json, es.json
supabase/             # config.toml + migrations
docs/                 # documentation
```

## Rendering & data flow

- **Reads** use React Server Components calling typed functions in `src/lib/data/*`, which use
  the **server** Supabase client (`src/lib/supabase/server.ts`).
- **Mutations** use **Server Actions** in `src/lib/**/actions.ts`. This avoids a separate API
  layer while keeping logic on the server.
- **Auth/session** is refreshed in `middleware.ts` via `src/lib/supabase/middleware.ts`, which
  also guards protected routes.
- **Security** is enforced at the database level with Row Level Security (RLS) — even if a query
  is wrong, a user can never read another user's rows.

## Localization

`next-intl` is configured **without URL-based routing**. The active locale is resolved per request
from the `AIOS_LOCALE` cookie (set from the user's `preferred_language` setting or the language
switcher), falling back to the default. Messages load from `messages/<locale>.json`.

Add a language by: (1) creating `messages/<locale>.json`, (2) adding it to `locales` in
`src/i18n/config.ts`. No component changes required.

## Theming & branding

Tailwind CSS v4 with CSS variables. Brand tokens (AIOS indigo, surfaces, semantic colors) are
defined once in `src/app/globals.css` under `:root` / `.dark` and exposed to Tailwind via
`@theme inline`. Dark mode is class-based (`.dark` on `<html>`), set before paint by
`ThemeScript` to avoid flashes; toggled by `ThemeToggle` and persisted to `localStorage`.
Harmony uses the official v2 logo as the canonical mark. `getHarmonyLogoSrc(locale)` supports
official localized logo assets when they exist and falls back to the canonical mark otherwise.

## Supabase layering

- `client.ts` — browser client (anon key) for Client Components.
- `server.ts` — server client wired to Next's async cookies for RSC / Route Handlers / Actions.
- `middleware.ts` — refreshes the session cookie on every request and redirects unauthenticated
  users away from protected routes.

Clients are constructed lazily inside functions, never at module scope, so a missing env var
never breaks the build.

## What is intentionally NOT here (yet)

Opera, mobile apps, billing, CRM, team management, enterprise
features, and an AI agent marketplace are **out of scope** for this build and must not be added
until their dedicated phases.
