-- ============================================================================
-- AIOS Core — Billing: Stripe customers + subscriptions
-- Backs Harmony plan gating (Starter / Professional / Business / Enterprise).
--
-- Rows are READ by their owner via RLS; they are WRITTEN only by the
-- service-role client from the Stripe webhook + checkout provisioning, which
-- bypasses RLS (so no insert/update/delete policies are granted to users).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- billing_customers — maps a Harmony user to their Stripe customer.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions — current Stripe subscription state per user.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null,
  plan text not null default 'free',
  price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);
create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);

-- updated_at trigger (re-uses the shared public.set_updated_at() function).
drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner may READ; all writes go through the service role.
-- ---------------------------------------------------------------------------
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "owner_select" on public.billing_customers;
create policy "owner_select" on public.billing_customers
  for select using (auth.uid() = user_id);

drop policy if exists "owner_select" on public.subscriptions;
create policy "owner_select" on public.subscriptions
  for select using (auth.uid() = user_id);
