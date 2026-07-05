-- ============================================================================
-- AIOS Phase 2.1 — Clarification persistence: resumable execution + explainability.
--
-- Additive columns on public.clarification_requests so a paused worker turn can
-- resume EXACTLY where it left off (resume_payload = the objective + context)
-- and carry Law 7 explainability metadata (why the pause happened, which inputs
-- were missing, when it resolved).
--
-- APPLYING THIS IS BEHAVIOUR-NEUTRAL: columns are nullable and only populated by
-- the clarification engine once wired. Additive + idempotent; RLS unchanged
-- (inherited from the base table). No existing tables/columns are modified.
-- ============================================================================

alter table public.clarification_requests
  add column if not exists resume_payload jsonb,
  add column if not exists explainability jsonb;
