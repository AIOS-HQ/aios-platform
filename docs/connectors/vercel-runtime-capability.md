# Mason Vercel runtime capability

## Canonical path

```text
Mason / Harmony
  -> getCanonicalVercelDeploymentStatus
  -> direct Vercel REST reads (when scoped configuration is complete)
  -> GitHub Vercel commit/deployment evidence
  -> runtime deployment identity
  -> VercelDeploymentStatusResult
```

`src/lib/integrations/vercel/deployment-status.ts` owns the typed result,
normalization, contradiction detection, evidence tiers, and readiness rules.
`src/lib/integrations/clients/vercel.ts` is the single orchestration adapter used
by the connector runtime, Mason, Harmony diagnostics, workforce certification,
and production readiness.

## Previous blocker

The connector catalog advertised `deployment_status`, while the legacy Vercel
client returned raw deployment-list payloads and the Universal Capability
Runtime had no Vercel handler. Runtime health equated token presence with
capability health and ignored GitHub deployment/runtime-identity fallback.
Guarded merge checked generic GitHub workflow runs but did not require matching
Vercel evidence. This made Vercel appear metadata-only or configuration-only and
could not distinguish unavailable evidence from a healthy deployment.

## Evidence contract

Statuses are `healthy`, `pending`, `failed`, `unavailable`, or
`misconfigured`. Evidence tiers, strongest first, are:

1. `direct_vercel_api`
2. `github_vercel_deployment_status`
3. `runtime_deployment_identity`
4. `unavailable`

Every result identifies its evidence sources and safely reports project,
deployment, environment, SHA, readiness, timestamps, alias evidence, build-event
availability, and limitations. A missing credential is `unavailable`; invalid
credentials or contradictory scope/domain/SHA evidence are `misconfigured`.
Neither state can become healthy through fallback coercion.

GitHub Vercel checks/deployments remain valid fallback evidence but are never
labeled as direct Vercel API proof. Runtime identity proves only the serving
build's metadata. Production alias certification requires direct alias evidence
or corroborating GitHub deployment plus runtime identity.

## Direct read configuration

Optional server-only variables:

- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_PROJECT_PRODUCTION_URL` (public canonical target)

`VERCEL_API_TOKEN` and `VERCEL_ORG_ID` remain accepted as legacy aliases, but
new configuration should use the canonical names above. Direct API calls are
restricted to the configured team/project and use GET requests only. No code
path creates, promotes, redeploys, mutates aliases/projects/environment
variables, or deletes Vercel resources.

## Logs

The supported deployment-events endpoint is treated as build/deployment event
evidence only. It never sets `runtimeLogsAvailable` to true. Runtime-log access
remains false unless Vercel supplies a separately supported runtime-log or log
drain read path for the account.

## Governance

Unavailable Vercel evidence does not disable ordinary Mason conversation,
coding, validation, or allowed PR creation. Guarded merge requires a concrete
PR, expected head SHA, passing GitHub checks, and healthy matching preview
evidence. Pending, failed, unavailable, misconfigured, or SHA-mismatched Vercel
evidence blocks the merge gate. Existing Founder approval and merge policies are
unchanged.
