-- ============================================================================
-- AIOS Core — Harmony Auto-Learning: approval requirement (Phase 7)
--
-- Adds a per-user "require approval for new memories" flag to learning_settings.
-- When on, automatic memory captures are queued as pending actions for review
-- (agent_actions) instead of being saved directly.
--
-- Additive + idempotent. No data is changed; no existing column is altered.
-- ============================================================================

alter table public.learning_settings
  add column if not exists require_approval boolean not null default false;
