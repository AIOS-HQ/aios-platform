# Mason Execution Bridge

## Executive Summary

Mason is the AIOS Founder-only engineering provider. The Mason Execution Bridge turns Mason's planning/runtime contract into an explicit branch → validation → PR → reporting → Founder approval boundary.

The bridge does not give Mason subscriber access, direct production edit authority, destructive authority, or autonomous merge authority. It gives Harmony/AEO a deterministic contract for routing engineering tasks to Mason and proving whether execution is ready, paused for approval, or blocked.

## Architecture Summary

The bridge lives at `src/lib/harmony/code/mason-execution-bridge.ts` and composes the existing Mason runtime from `src/lib/harmony/code/mason.ts`.

The bridge provides:

- Harmony/AEO routing metadata through `routedBy: "harmony_aeo"`.
- Founder-only access gating.
- Scoped branch planning with base branch and execution branch names.
- Mutation gating based on Founder approval.
- Required validation commands.
- PR preparation metadata with summary, risks, changed files, and validation evidence.
- Reporting targets for Activity, Review Queue, Outcomes, Julius, and Company Skills.
- Merge policy that always remains Founder approval-gated.

## Required Validation

Mason engineering execution must request or run:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run i18n:check`
- `npm run build`

## Safety Boundaries

Mason must never:

- Merge without Founder approval.
- Edit production directly.
- Expose Mason to subscribers.
- Perform destructive actions.
- Bypass approval gates.

## Remaining Gaps

This bridge is a deterministic TypeScript contract and test surface. Actual live connector writes still depend on the approved GitHub/Vercel connector execution layer and should call this bridge before mutating branches, opening PRs, or reporting outcomes.
