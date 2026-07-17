# Julius Wiring Report (Milestone 7)

## Scope
- Julius remains the shared company-scoped organizational brain.
- Julius is **not** a workforce worker.
- Atlas remains a governed stewardship role; no unrestricted admin behavior.

## Canonical Interaction Context
Implemented in `src/lib/julius/interaction-context.ts` and reused by retrieval/write-back:
- Required: `company_id`, `execution_id`, `correlation_id`, `worker_id`, `source_type`, `source_id`.
- Worker validation against workforce registry.
- Placeholder ID rejection.
- Secret-like metadata rejection in trace payload.
- Cross-company access blocked via `assertCompanyScope`.

## Retrieval-before-Execution
Implemented for Mason in `src/lib/julius/mason-retrieval.ts` and integrated in `src/lib/workforce/mason-action.ts`:
- Retrieval status: `found | empty | degraded | failed`.
- Retrieval evidence linked to execution and correlation IDs.
- Retrieval failure blocks Mason planning path; degraded mode remains truthful.

## Verified Write-back
Implemented in `src/lib/julius/writeback.ts` using `recordJuliusEntry(...)` from `src/lib/julius/service.ts`.
- Supports verified categories:
  - `engineering_completion`
  - `engineering_decision`
  - `failure_lesson`
  - `rollback_lesson`
  - `recovery_lesson`
  - `founder_clarification`
  - `approved_blocker`
- Rejects unverified outcomes, missing context/source, blocked-as-completion/decision, and disallowed categories.
- Preserves source attribution and policy/approval metadata.

## Workforce Memory Permissions
Implemented in `src/lib/julius/permissions.ts` for authoritative workers:
- `harmony`, `auditor`, `mason`, `catalyst`, `ambassador`, `atlas`, `pulse`, `horizon`, `aegis`, `ledger`.
- Defines per-worker:
  - retrieval categories
  - write categories
  - approval-required categories
  - denied categories
- Enforces least privilege, company scope, verification, and executable-runtime gating.
- Unsupported/registered-only workers cannot fake successful writes.

## Atlas Stewardship
Atlas stewardship is policy metadata + checks only in this milestone:
- Allowed stewardship actions:
  - `dedupe_review`
  - `source_quality_review`
  - `index_curation_request`
  - `knowledge_quality_classification`
  - `merge_reject_recommendation`
- Denied:
  - cross-company access
  - source fabrication
  - secret-like metadata access
  - unrestricted administrator behavior
- No fake Atlas runtime introduced.

## Idempotency and Replay
- Deterministic logical write identity: company + execution + worker + source type + source id + category.
- Duplicate same-payload writes: `deduplicated`.
- Duplicate conflicting payload: rejected (`conflicting_duplicate_payload`).
- Replay safety maintained without creating duplicate durable knowledge outcomes.

## Trace Linkage
Write-back responses now include trace metadata:
- `company_id`, `execution_id`, `correlation_id`, `causation_id`
- `worker_id`, `source_type`, `source_id`
- policy/approval state
- result state: `written | deduplicated | rejected | failed`

## Mocked vs Live Verification
- Repository tests use mocked adapters for Julius persistence/runtime boundaries.
- No live Supabase/Julius staging or production verification was executed in this milestone run.

## Staging Requirements
To verify live Julius behavior in staging:
1. Apply required Julius schema migrations in staging database.
2. Provide valid Supabase credentials and company-scoped test identities.
3. Run integration tests against staging with write/read verification.
4. Validate policy/approval gates and cross-company denials in staging logs.

## Remaining Milestone 8 Observability Work
- Founder-facing observability surfaces for Julius retrieval/write lifecycles.
- Cross-run timeline aggregation UI (Event Mesh + ledger + Julius).
- Rich review queue drill-down for write denials/deduplications.
- Operational dashboards for degraded retrieval and write failures.
