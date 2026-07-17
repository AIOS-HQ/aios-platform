-- Permanent Mason durable execution ledger
-- Additive, append-only event log keyed by execution_id + idempotency key.
-- Migration authored only; not executed in this milestone.

create extension if not exists pgcrypto;

create table if not exists public.mason_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null,
  user_id uuid not null,
  company_id text not null,
  agent text not null default 'mason',
  event_type text not null,
  runtime_state text,
  operation_type text,
  connector_id text,
  target_resource text,
  approval_id text,
  pull_request_number bigint,
  pull_request_url text,
  preview_url text,
  validation_ref text,
  rollback_ref text,
  result_status text not null,
  failure_classification text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  check (agent = 'mason'),
  check (event_type in (
    'intake_received',
    'policy_evaluated',
    'approval_requested',
    'approval_granted',
    'approval_denied',
    'execution_started',
    'connector_operation_started',
    'connector_operation_completed',
    'connector_operation_failed',
    'validation_started',
    'validation_completed',
    'rollback_started',
    'rollback_completed',
    'rollback_failed',
    'reporting_started',
    'reporting_completed',
    'execution_completed',
    'execution_failed',
    'execution_cancelled'
  )),
  check (result_status in ('ok', 'blocked', 'failed', 'cancelled', 'partial')),
  check (char_length(execution_id) between 8 and 200),
  check (char_length(idempotency_key) between 8 and 255),
  check (summary <> ''),
  check (metadata is not null)
);

create unique index if not exists mason_execution_events_idempotency_key_uq
  on public.mason_execution_events (idempotency_key);

create index if not exists mason_execution_events_user_company_created_idx
  on public.mason_execution_events (user_id, company_id, created_at desc);

create index if not exists mason_execution_events_execution_created_idx
  on public.mason_execution_events (execution_id, created_at asc);

create index if not exists mason_execution_events_company_event_created_idx
  on public.mason_execution_events (company_id, event_type, created_at desc);

alter table public.mason_execution_events enable row level security;

drop policy if exists "owner_select" on public.mason_execution_events;
create policy "owner_select" on public.mason_execution_events
  for select using (auth.uid() = user_id);

drop policy if exists "owner_insert" on public.mason_execution_events;
create policy "owner_insert" on public.mason_execution_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner_update_none" on public.mason_execution_events;
create policy "owner_update_none" on public.mason_execution_events
  for update using (false) with check (false);

drop policy if exists "owner_delete_none" on public.mason_execution_events;
create policy "owner_delete_none" on public.mason_execution_events
  for delete using (false);
