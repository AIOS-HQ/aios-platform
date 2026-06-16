-- ============================================================================
-- Founder OS — Communications grants for authenticated users.
-- RLS policies already owner-scope rows; these grants allow authenticated users
-- to exercise those policies through Supabase PostgREST.
-- ============================================================================

grant select, insert, update, delete on table public.channels to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
