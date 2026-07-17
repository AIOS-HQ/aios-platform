# Permanent Mason Durable Execution Ledger

This document defines the append-only, tenant-scoped execution ledger for
Permanent Mason.

## Purpose

Provide one canonical execution identity and durable event timeline from intake
through policy, approval, execution, validation, rollback, reporting, and final
outcome.

## Canonical Execution ID

`createMasonExecutionId()` produces a stable scoped identifier using:

- user
- company
- repository
- branch
- objective fingerprint

This ID is reused for ledger event correlation across runtime phases.

## Event Model

Events are append-only rows in `public.mason_execution_events` with:

- `execution_id`
- tenant scope (`user_id`, `company_id`)
- `event_type`
- runtime and operation context
- lineage refs (`approval_id`, PR, preview, validation, rollback)
- result and failure classification
- summary + structured metadata
- `idempotency_key`
- timestamp

## Event Types

- intake_received
- policy_evaluated
- approval_requested
- approval_granted
- approval_denied
- execution_started
- connector_operation_started
- connector_operation_completed
- connector_operation_failed
- validation_started
- validation_completed
- rollback_started
- rollback_completed
- rollback_failed
- reporting_started
- reporting_completed
- execution_completed
- execution_failed
- execution_cancelled

## Idempotency and Immutability

- `idempotency_key` is unique.
- duplicate logical writes return existing rows.
- update/delete are denied by RLS policy (append-only behavior).

## Tenant Isolation and RLS

RLS policies are owner-scoped (`auth.uid() = user_id`) for select/insert.
Update/delete are denied.

This migration is authored in Milestone 4 and statically validated only.
Migration execution and live RLS verification are deferred to staging
certification.

## Runtime Integration Points

- intake event in production runtime
- policy decision event
- approval required event
- execution started event
- per-connector operation start/completion/failure events
- final execution outcome event
- rollback references included in final outcome metadata when present

## Failure Behavior

If ledger persistence fails, runtime behavior remains truthful:

- no event is claimed persisted unless write succeeded
- failures are surfaced via runtime summaries/logging
- no fake audit records are emitted

## Query Patterns

- full execution timeline by `execution_id`
- latest execution state by `execution_id`
- company history ordered by `created_at`

## Known Limitations

- migration not applied in this milestone
- live RLS behavior not yet staging-certified
- additional event coverage (approval granted/denied hooks, explicit
  validation/reporting lifecycle rows) can be expanded in follow-up milestones
