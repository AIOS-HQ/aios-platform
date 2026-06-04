# AIOS Platform

**Artificial Intelligence Operating Systems** — secure, accessible, AI-powered operating systems for life and business.

AIOS Core is the shared foundation that powers two products:

- **Harmony** — the Personal Operating System (students, parents, families, seniors, professionals, accessibility users).
- **Opera** — the Business Operating System _(planned for a later phase — not in this build)._

This repository currently contains the **AIOS Core foundation** and **Harmony Lite** (the first working product). Opera, the marketplace, mobile apps, and billing are intentionally **not** built yet.

> Guiding principles: **Human in control · Trust before automation · Global first · Accessibility first · Users own their data.**

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui-style components |
| Auth & data | Supabase (Auth + Postgres with Row Level Security) |
| i18n | next-intl (English + Spanish, cookie-driven, no URL segment) |
| Icons / toasts | lucide-react / sonner |

---

## Quick start (local)

### 1. Prerequisites

- Node.js **20+** (Node 22/24 recommended)
- npm **10+**
- A free [Supabase](https://supabase.com) project (for Sprint 1 auth + data)

### 2. Install

```bash
git clone https://github.com/AIOS-HQ/aios-platform.git
cd aios-platform
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values (see [Environment variables](#environment-variables)). At minimum you need
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the
publishable/anon key) from **Supabase → Project Settings → API**.

> The landing page and UI run without Supabase configured, but authentication and data
> features (Sprint 1+) require it.

### 4. Set up the database (Sprint 1+)

Apply the schema to your Supabase project. See **[docs/DATABASE.md](docs/DATABASE.md)** for both
options (Supabase CLI migrations _and_ a copy-paste SQL script). _(Added in Sprint 1.)_

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint with ESLint |

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable/anon key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-only key for maintenance tooling (never exposed to the browser) |
| `NEXT_PUBLIC_SITE_URL` | — | Public site URL for auth email redirect links (default `http://localhost:3000`) |
| `AI_PROVIDER` | — | `mock` (default), `openai`, or `anthropic` for the Life Operator |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Provider key; only needed if `AI_PROVIDER` is set to a real provider |
| `AI_MODEL` | — | Optional model override |

All `.env*` files are gitignored except `.env.example`.

---

## Project structure

```
src/
  app/                # App Router routes (landing, auth, dashboard…)
  components/
    ui/               # shadcn/ui-style primitives
    brand/            # AIOS logo + branding
  i18n/               # next-intl config, request resolver, locale actions
  lib/
    supabase/         # browser + server Supabase clients
    utils.ts          # cn() class helper
    env.ts            # centralized env access
    constants.ts      # shared branding constants
messages/             # en.json, es.json translation catalogs
docs/                 # architecture + setup documentation
supabase/             # migrations + config (Sprint 1+)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full design.

---

## Localization

AIOS is **global-first**. English and Spanish ship from day one; user-facing strings live in
`messages/<locale>.json` (never hardcoded in components). Adding Portuguese, French, German, or
Italian later is a matter of adding a `messages/<locale>.json` file and extending the `locales`
array in `src/i18n/config.ts`.

## Accessibility

Semantic HTML, keyboard-friendly navigation, visible focus rings, a skip-to-content link,
labelled controls, reduced-motion support, and AA-minded color contrast are built in from the
foundation.

---

## Roadmap

- ✅ **Foundation** — Next.js + TS + Tailwind + shadcn/ui + Supabase clients + i18n + branding
- ✅ **Sprint 1 — AIOS Core** — auth, profiles, roles, settings, schema, protected shell
- ✅ **Sprint 2 — Harmony Lite** — dashboard, tasks, goals, notes, Personal Brain, Life Operator, Life Advisor
- ⬜ Opera (Business OS), mobile, marketplace, billing — _future phases_

## License

Proprietary — © AIOS. All rights reserved.
