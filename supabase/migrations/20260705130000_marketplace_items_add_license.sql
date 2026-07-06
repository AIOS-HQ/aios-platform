-- ============================================================================
-- Marketplace licensing — additive, nullable `license` column on
-- marketplace_items (e.g. "MIT", "Apache-2.0", "Proprietary", "AIOS Standard").
--
-- Backwards compatible: existing items keep license = null and render without a
-- license badge. No RLS change — the existing owner policies + authenticated
-- grants already cover all columns. Licensing ONLY — not billing, pricing,
-- purchases, or entitlements. Reversible (ALTER TABLE ... DROP COLUMN license).
-- ============================================================================

alter table public.marketplace_items add column if not exists license text;
