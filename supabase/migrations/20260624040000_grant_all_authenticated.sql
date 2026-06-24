-- ============================================================================
-- Founder OS — Backstop grants for the authenticated role (all public tables).
--
-- This project requires explicit table GRANTs to `authenticated` for PostgREST
-- access (RLS alone is not enough). Several tables shipped without them and were
-- silently broken until retrofitted (settings, communications, agent_messages,
-- ops_events). This migration closes the entire class: it grants
-- select/insert/update/delete to `authenticated` on EVERY public table.
--
-- This does NOT widen data access: Row Level Security still governs which rows
-- each authenticated user may see/modify. The grant only lets PostgREST attempt
-- the operation; tables without a matching RLS policy still reject it. Tables
-- meant to be service-role-only keep their write protection via the absence of
-- owner write policies.
--
-- Idempotent (re-granting is a no-op) + additive + non-destructive. Dynamic, so
-- it can never reference a non-existent table and automatically covers any table
-- that was missing a grant.
-- ============================================================================

do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      t.tablename
    );
  end loop;
end $$;
