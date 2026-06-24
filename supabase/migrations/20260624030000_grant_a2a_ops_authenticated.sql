-- ============================================================================
-- Founder OS — Grants for agent_messages + ops_events (authenticated role).
--
-- Same root cause as the settings/communications grant migrations: this project
-- requires an explicit table GRANT to `authenticated` for PostgREST access in
-- addition to RLS. The agent_messages (A2A) and ops_events (observability) tables
-- were created with RLS policies but no grant, so RLS-client reads silently
-- returned nothing and RLS-client writes (e.g. dispatching an agent task) hit
-- "permission denied for table". (Server-side recordOpsEvent uses the service
-- role, which is why logging worked but reads/dispatch did not.)
--
-- RLS still owner-scopes every row (auth.uid() = user_id). Idempotent + additive.
-- ============================================================================

grant select, insert, update, delete on table public.agent_messages to authenticated;
grant select, insert, update, delete on table public.ops_events to authenticated;
