-- ============================================================================
-- Founder OS — link approvals to communications messages (D4).
-- Additive + idempotent. Adds a nullable FK so a gated outbound message can
-- surface as a row in the unified Approval Center. No redesign; existing
-- approvals (work-item / manual) are unaffected (message_id stays null).
-- ============================================================================

alter table public.approvals
  add column if not exists message_id uuid
    references public.messages(id) on delete cascade;

create index if not exists approvals_message_idx on public.approvals(message_id);
