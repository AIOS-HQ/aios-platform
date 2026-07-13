# AIOS Core

AIOS Core is the shared foundation that powers the canonical product surfaces
defined in [`docs/product/AIOS_PRODUCT_ARCHITECTURE.md`](product/AIOS_PRODUCT_ARCHITECTURE.md):
Public AIOS Website, Subscriber Harmony, Founder OS, and the future
customer-deployed company website/application layer. Subscriber Harmony contains
both personal and business/company operating modes rather than requiring a
separate product codebase. This document covers the Sprint 1 deliverables:
authentication, profiles, roles, settings, and the protected app shell.

## Authentication

Supabase Auth (email + password). Flows:

| Flow | Route | Notes |
| --- | --- | --- |
| Sign up | `/signup` | Creates the user; profile + settings auto-created by trigger |
| Log in | `/login` | Email + password |
| Log out | server action `signOut()` | From the user menu / settings |
| Password reset request | `/reset-password` | Emails a secure link |
| Set new password | `/update-password` | Reached via the email link |
| Email link handler | `/auth/callback` | Exchanges the PKCE code for a session |

Sessions are refreshed on every request by `middleware.ts` (→ `lib/supabase/middleware.ts`), which
also:

- redirects unauthenticated users away from `/harmony*` and `/settings*` to `/login`, and
- redirects authenticated users away from auth pages to `/harmony`.

Server Actions live in `src/lib/auth/actions.ts` and return a localized `ActionState` consumed by
the forms via React's `useActionState`.

## Roles

`profiles.role` is an enum: `personal_user` (default), `business_owner`, `admin`.

- Helper `public.is_admin()` (SECURITY DEFINER) is used inside RLS to grant admins read access to
  all profiles without causing policy recursion.
- A guard trigger (`prevent_role_escalation`) silently reverts attempts by non-admins to change
  their own role — even direct API calls cannot escalate privileges.
- App-side, the role is surfaced in **Settings → Account** and available via `getProfile()`.

## Settings

`user_settings` stores `preferred_language`, `timezone`, and `theme`.

- **Profile form** updates `full_name`.
- **Preferences form** updates language + time zone. Saving the language also writes the
  `AIOS_LOCALE` cookie so the UI switches immediately.

## Data access & mutations

- **Reads**: typed functions in `src/lib/data/*` using the server Supabase client.
- **Mutations**: Server Actions in `src/lib/**/actions.ts`, which `revalidatePath` affected routes.
- **Security**: enforced by Postgres RLS (see [DATABASE.md](DATABASE.md)) — the app layer is a
  convenience, not the security boundary.

## App shell

`src/app/(app)/layout.tsx` requires a session and renders `AppShell`:

- **Sidebar** (desktop) + **MobileNav** (drawer) driven by `components/app/nav-config.ts`.
- **Top bar** with language switcher, theme toggle, and a user menu (profile, settings, sign out).
- All labels are localized via the `nav` translation namespace.

## Accessibility & i18n

Semantic landmarks, a skip link, labelled controls, keyboard-operable menus (Radix), visible focus
rings, and AA-minded contrast. All user-facing strings are in `messages/en.json` and
`messages/es.json`.
