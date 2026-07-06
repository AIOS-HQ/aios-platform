-- ============================================================================
-- Fix latent RLS read-path failures on 9 owner-scoped tables.
--
-- These tables have owner-scoped SELECT policies (auth.uid() = user_id) or the
-- marketplace `select_own_or_public_verified` policy, but the `authenticated`
-- role was never granted table SELECT -- so RLS-scoped reads (createServerClient
-- running as `authenticated`) hit 42501 permission denied and silently returned
-- empty. This is the same class that previously hid integration_connections and
-- the communications/settings tables.
--
-- SECURITY: granted per-table (NOT via a blanket grant-all loop) precisely
-- because token-bearing tables like integration_connections must NOT receive a
-- table-level SELECT grant -- they keep a column-scoped grant that excludes the
-- token columns. None of the 9 tables below contain token/secret columns
-- (stripe_customer_id / stripe_subscription_id are non-secret references), so a
-- table-level SELECT grant is safe. RLS continues to govern which rows each
-- authenticated user may read.
--
-- Idempotent (re-granting is a no-op) + additive + reversible
-- (REVOKE SELECT ... FROM authenticated).
-- ============================================================================

grant select on table public.billing_customers to authenticated;
grant select on table public.company_installations to authenticated;
grant select on table public.content_items to authenticated;
grant select on table public.julius_entries to authenticated;
grant select on table public.marketplace_item_ratings to authenticated;
grant select on table public.marketplace_item_versions to authenticated;
grant select on table public.marketplace_items to authenticated;
grant select on table public.projects to authenticated;
grant select on table public.subscriptions to authenticated;
