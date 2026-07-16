# Permanent Mason Rollback and Recovery Engine

This document defines the rollback/recovery behavior for Permanent Mason runtime
executions.

## Triggers

- branch creation failure
- file mutation failure
- commit failure
- pull-request creation failure
- validation failure
- preview deployment failure
- reporting or audit failure
- connector failure
- unexpected runtime failure
- founder-requested cancellation

## Runtime Recovery States

Canonical runtime states extend Mason with:

- `rollback_pending`
- `rolling_back`
- `recovered`
- `recovery_failed`

Legal transitions are enforced by `mason-runtime-state.ts`:

- `executing -> rollback_pending`
- `rollback_pending -> rolling_back`
- `rolling_back -> recovered | recovery_failed`

Illegal transitions are rejected deterministically.

## Compensation Order

Rollback plans are deterministic and scoped to the current Mason execution:

1. Close incomplete pull request (if created)
2. Mark execution branch for founder-reviewed cleanup (no direct destructive branch deletion)
3. Record preview failure/invalidation state
4. Record validation failure state
5. Emit compensating report + activity + review queue + Julius + Company Skills updates

If no external mutation occurred, rollback includes a no-op compensation step.

## Idempotency

Every compensation operation has a stable `idempotencyKey` based on execution
identity and operation kind. Repeated rollback requests skip already completed
steps and avoid repeated side effects.

## Automated vs Manual Recovery

Automated recovery is attempted only for scoped, safe operations. If any step
fails, the engine returns one of:

- `partially_recovered`
- `rollback_failed`
- `manual_intervention_required`

Manual recovery instructions are preserved in founder-facing summaries.

## Safety Boundaries Preserved

- Founder-only authority remains unchanged.
- No direct modification of `main`.
- No autonomous production deployment.
- No destructive cleanup outside scoped execution resources.
- Audit evidence is preserved; rollback emits compensating reporting operations.

## Known Limitations

- Branch deletion is not automatic; branch cleanup is marked for founder review.
- PR close compensation depends on GitHub connector capability support.
- External systems are represented by adapter calls; unit tests use mocks.
