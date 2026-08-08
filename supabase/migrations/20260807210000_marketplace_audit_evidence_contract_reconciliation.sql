-- Marketplace Production M4 evidence contract reconciliation.
-- Additive, idempotent alignment of agent_autonomy_audit with marketplace evidence writes.

alter table if exists public.agent_autonomy_audit
  add column if not exists operation text,
  add column if not exists reason text,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists policy_key text,
  add column if not exists payload jsonb,
  add column if not exists agent_id text,
  add column if not exists actor_type text,
  add column if not exists actor_id text,
  add column if not exists confidence double precision,
  add column if not exists metadata jsonb,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists status text,
  add column if not exists reason_code text,
  add column if not exists idempotency_key text;

create unique index if not exists agent_autonomy_audit_operation_policy_key_uq
  on public.agent_autonomy_audit (operation, policy_key)
  where operation is not null and policy_key is not null;

create unique index if not exists agent_autonomy_audit_idempotency_key_uq
  on public.agent_autonomy_audit (idempotency_key)
  where idempotency_key is not null;
