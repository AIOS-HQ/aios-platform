-- Marketplace Production M4 idempotency index reconciliation.
-- Ensure canonical ON CONFLICT targets have non-partial unique index arbiters.

drop index if exists public.agent_autonomy_audit_operation_policy_key_uq;
create unique index if not exists agent_autonomy_audit_operation_policy_key_uq
  on public.agent_autonomy_audit (operation, policy_key);

drop index if exists public.agent_autonomy_audit_idempotency_key_uq;
create unique index if not exists agent_autonomy_audit_idempotency_key_uq
  on public.agent_autonomy_audit (idempotency_key);
