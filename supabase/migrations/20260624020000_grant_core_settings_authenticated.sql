-- ============================================================================
-- Founder OS — Core identity/settings grants for authenticated users.
--
-- ROOT CAUSE FIX (Settings save error "Something went wrong"): in this project
-- PostgREST access for the `authenticated` role requires an explicit table
-- GRANT in addition to the RLS policies (same situation the communications
-- grants migration 20260616140000 fixed). profiles + user_settings were created
-- in migration 0001 before grants were applied, so authenticated UPDATEs hit
-- "permission denied for table" (SQLSTATE 42501) and reads returned nothing —
-- the Settings form showed blank fields and saving failed.
--
-- RLS already owner-scopes every row (auth.uid() = id / user_id); these grants
-- only let authenticated users EXERCISE those existing policies. companies is
-- included for the company-settings path. Idempotent + additive + non-destructive.
-- ============================================================================

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
