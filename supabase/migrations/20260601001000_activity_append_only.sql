-- ============================================================================
-- Founder OS — make the activity feed an append-only audit log (D6).
-- Additive + idempotent. Drops only the UPDATE/DELETE RLS policies on
-- activity_events so the authenticated owner can SELECT + INSERT but never
-- mutate or remove audit rows. No schema/redesign; no code path updates or
-- deletes activity events, so behavior is unchanged.
--
-- Note: removing the RLS policies blocks app-level UPDATE/DELETE only — it does
-- NOT block ON DELETE CASCADE from auth.users (cascade runs outside RLS), so
-- account deletion still cleans up the owner's activity rows.
-- ============================================================================

drop policy if exists "owner_update" on public.activity_events;
drop policy if exists "owner_delete" on public.activity_events;

-- (owner_select + owner_insert from migration 0600 remain in place.)
