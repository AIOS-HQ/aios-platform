# Database setup

AIOS uses **Supabase** (Postgres + Auth). Apply the schema with **either** method below.
Both produce the same result and are safe to re-run.

> The sandbox/agent that generated this code cannot connect to your database, so
> you apply the schema yourself. It takes ~2 minutes.

## Tables created

| Table | Purpose |
| --- | --- |
| `profiles` | 1:1 with `auth.users` — email, full name, **role** |
| `user_settings` | preferred language, time zone, theme |
| `personal_tasks` | tasks (status, priority, due date) |
| `personal_goals` | goals (progress 0–100, status) |
| `personal_notes` | notes (title + content) |
| `personal_brains` | Personal Brain store (future AI memory layer) |

Roles: `personal_user` (default), `business_owner`, `admin`.

A trigger (`handle_new_user`) auto-creates a `profiles` + `user_settings` row on signup.
**Row Level Security** is enabled on every table — each user can only read/write their own rows
(admins can additionally read all profiles). A guard trigger prevents non-admins from escalating
their own role.

---

## Option A — Supabase CLI (recommended)

```bash
# 1. Install the CLI: https://supabase.com/docs/guides/cli
# 2. Link this repo to your hosted project (find the ref in your project URL/settings)
supabase link --project-ref <your-project-ref>

# 3. Push the migrations in supabase/migrations/
supabase db push
```

## Option B — SQL Editor (copy & paste)

1. Open your project → **SQL Editor** → **New query**.
2. Copy the entire contents of [`docs/database/schema.sql`](database/schema.sql).
3. Paste and click **Run**.

---

## Connect the app

Add to `.env.local` (from **Project Settings → API**):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# "publishable" in newer dashboards, "anon" in older ones — either env name works
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Auth configuration

In **Authentication → URL Configuration**, add a redirect URL:

```
http://localhost:3000/auth/callback
```

(Use your production domain too when you deploy.)

- **Email confirmations:** For fast local testing you can disable them
  (**Authentication → Providers → Email → Confirm email = off**); signup then returns a session
  immediately. Keep confirmations **on** in production — the app already handles the
  "check your email" flow.
- Password reset and email-confirmation links both return to `/auth/callback`, which exchanges
  the code for a session.

## Verify

After applying the schema and signing up, you should see a row in `profiles` and `user_settings`
for your new user, and you should be redirected into the dashboard.

## Troubleshooting

- **Redirected to `/login` in a loop:** ensure the Supabase env vars are set and the dev server
  was restarted after editing `.env.local`.
- **`new row violates row-level security`:** confirm you ran the full schema (RLS policies are at
  the bottom of each migration) and that you're authenticated.
- **No `profiles` row after signup:** confirm the `on_auth_user_created` trigger exists (re-run
  `schema.sql`).
