# Mason Completion Program — Consolidated Implementation

This document records the canonical implementation path delivered in this change set. It supersedes scattered tracking notes for the same concerns and is intentionally evidence-first.

## Canonical capability registry

- Authoritative source: `src/lib/mason/capability-registry.ts`
- Canonical inputs: `AIOS_WORKFORCE`, `getAgentConnectors`, `WORKFORCE_RUNTIME_CONTRACTS`
- Purpose: keep one agent capability view for runtime contract + connector dependencies; prevent duplicate capability maps in separate reporting paths.

## Founder readiness report

- Canonical source: `src/lib/mason/founder-readiness-report.ts`
- Canonical evidence path: `workforce.certification`
- Rules:
  - Report only evidence-backed statuses from `WorkforceAgentCertification`.
  - Fail closed when a canonical agent has no certification evidence.
  - Never infer healthy/production from missing data.
  - Preserve Founder-only governance boundaries via `isFounderOnlyAgent`.

## Runtime/certification consolidation

- Canonical orchestration remains `src/lib/workforce/certification.ts`.
- Workforce certification now resolves runtime contract + connector dependencies through the unified Mason capability registry instead of maintaining separate per-function connector maps.

## Evidence classes

The Mason reporting layer keeps evidence source classes explicit:

- `live`: authenticated or direct runtime proof (`live_runtime_proof`, `authenticated_runtime_proof`)
- `source_derived`: configuration/source proof (`configuration_proof`, `source_code_proof`)
- `simulated`: unknown/no runtime proof (`unknown`)
- `mocked`: explicit non-runtime synthetic evidence types

These classes are represented by `classifyMasonEvidenceType` and surfaced in Founder readiness output.

## Coverage added

- `tests/unit/mason-capability-registry.test.ts`
- `tests/unit/founder-readiness-report.test.ts`

The tests verify canonical registry shape, explicit evidence-class mapping, fail-closed Founder readiness behavior, and no optimistic status inference.

