-- ============================================================================
-- Marketplace write paths — grant authenticated the DML the RLS policies gate.
--
-- The owner_insert/update/delete (items, versions, installations) and rater_*
-- (ratings) RLS policies already exist, but the `authenticated` role was never
-- granted INSERT/UPDATE/DELETE — so install, update, uninstall, publish, and
-- review writes all hit 42501 permission denied (the write-path twin of the
-- SELECT-grant gap fixed in 20260705110000). These tables hold config/knowledge
-- references only (no tokens/secrets) and RLS confines every write to the
-- caller's own rows (auth.uid() = user_id), so table-level DML grants are safe.
-- Additive + reversible (REVOKE INSERT,UPDATE,DELETE ... FROM authenticated).
-- ============================================================================

grant insert, update, delete on public.marketplace_items to authenticated;
grant insert, update, delete on public.marketplace_item_versions to authenticated;
grant insert, update, delete on public.marketplace_item_ratings to authenticated;
grant insert, update, delete on public.company_installations to authenticated;
