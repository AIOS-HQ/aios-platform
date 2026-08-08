-- Marketplace Production M4 runtime evidence compatibility reconciliation.
-- Preserves legacy columns/RLS while extending decision domain for marketplace evidence.

alter table if exists public.agent_autonomy_audit
  drop constraint if exists agent_autonomy_audit_decision_check;

alter table if exists public.agent_autonomy_audit
  add constraint agent_autonomy_audit_decision_check
  check (
    decision in (
      'auto_executed',
      'notified',
      'pending_approval',
      'denied',
      'kill_switch',
      'lockdown',
      'applied',
      'blocked'
    )
  );
