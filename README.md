# AIOS Platform

**AIOS (Artificial Intelligence Operating Systems)** is the company and platform behind **Harmony** — secure, accessible, AI-powered software for life and business.

## Harmony — The Autonomous Operating System for Life and Business

One intelligent operating system that helps you organize, execute, communicate, automate, and grow across personal life and business. Harmony is organized into three hubs on top of a shared foundation:

- **Personal Hub** — life management: tasks, goals, notes, planning, the Personal Brain, and AI assistance.
- **Business Hub** — companies, departments, objectives, and AI helpers for business operations.
- **Harmony Hub** — the unifying layer that coordinates work across your personal and business life.

**AIOS Core** is the shared foundation — identity & auth, profiles, roles, settings, the UI system, localization, theming, and the Supabase data layer — that every hub is built on.

> **Build status:** This repository currently ships **AIOS Core** and Harmony's **Personal Hub** (the first released hub). The **Business Hub** and **Harmony Hub** are on the roadmap; the marketplace, mobile apps, and billing are intentionally **not** built yet.
>
> _Naming note: the previously planned separate **Opera (Business OS)** is now delivered as Harmony's **Business Hub** — there is no separate Opera product._

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

- Node.js **22** (matches `.nvmrc` and `package.json` `engines`)
- npm **10+**
- A free [Supabase](https://supabase.com) project (for auth + data)

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
> features require it.

### 4. Set up the database

Apply the schema to your Supabase project. See **[docs/DATABASE.md](docs/DATABASE.md)** for both
options (Supabase CLI migrations _and_ a copy-paste SQL script).

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
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run test` | Run the Vitest suite |
| `npm run i18n:check` | Verify translation-catalog parity across locales |

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase publishable/anon key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-only key for maintenance tooling (never exposed to the browser) |
| `NEXT_PUBLIC_SITE_URL` | — | Public site URL for auth email redirect links (default `http://localhost:3000`) |
| `AI_PROVIDER` | — | `mock` (default), `openai`, or `anthropic` for Harmony's AI assistant |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Provider key; only needed if `AI_PROVIDER` is set to a real provider |
| `AI_MODEL` | — | Optional model override (defaults: `gpt-4o-mini` for OpenAI, `claude-3-5-haiku-latest` for Anthropic) |

All `.env*` files are gitignored except `.env.example`. With no key, Harmony falls back to a built-in, no-cost mock assistant.

---

## Project structure

```
src/
  app/                # App Router routes (landing, auth, dashboard…)
  components/
    ui/               # shadcn/ui-style primitives
    brand/            # brand assets (AIOS + Harmony)
  i18n/               # next-intl config, request resolver, locale actions
  lib/
    supabase/         # browser + server Supabase clients
    utils.ts          # cn() class helper
    env.ts            # centralized env access
    constants.ts      # shared branding constants
messages/             # en.json, es.json translation catalogs
docs/                 # architecture + setup documentation
supabase/             # migrations + config
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full design.

---

## Localization

Harmony is **global-first**. English and Spanish ship from day one; user-facing strings live in
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
- ✅ **AIOS Core** — auth, profiles, roles, settings, schema, protected shell
- ✅ **Harmony · Personal Hub** — dashboard, tasks, goals, notes, Personal Brain, Life Operator, Life Advisor
- ⬜ **Harmony · Business Hub** — companies, departments, objectives, AI helpers _(roadmap; supersedes the former "Opera" plan)_
- ⬜ **Harmony · Harmony Hub** — cross-hub coordination layer _(roadmap)_
- ⬜ Mobile, marketplace, billing — _future phases_

## License

Proprietary — © AIOS. All rights reserved.
