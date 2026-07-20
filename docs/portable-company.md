# Portable Company

Expands **Portable Workforce** into a whole **deployable company**. Objective: an
entire autonomous company exports and imports together, redeployable to another
AIOS instance with minimal manual setup.

Portable Company is defined canonically in
[`docs/product/AIOS_PRODUCT_ARCHITECTURE.md`](product/AIOS_PRODUCT_ARCHITECTURE.md).
It is a configuration and knowledge portability layer, not a new company-specific
codebase and not a place to store credentials.

Module: `src/lib/company/portable-company.ts` (server-only, additive, inert —
explicit entry points, no automatic caller).

## A company IS its Envelope + brain + skills
`exportCompany(userId, companyId, { marketplaceAssets? })` composes existing
read-models (nothing is mutated) into a `PortableCompanyBundle`:

| Section | Source | Notes |
|---|---|---|
| Company identity | `WorkforcePackage` (envelope) | 30-section Company Context Envelope: **branding, governance, policies, founder settings, departments, objectives, projects, dashboards, reports, connector bindings (config-only)**. |
| Knowledge / Memory | Julius entries | knowledge · decision · objective · activity. |
| Skills | Company skills | Ride along; re-scoring resumes as work recurs. |
| Digital Twin | `buildDigitalTwin` | Derived; recomputes in the target. |
| Ledger | `getCompanyFinancialSnapshot` | Point-in-time; recomputes in the target. |
| Marketplace assets | caller-supplied refs | Re-provisioned in the target. |

## Operations
The full deployment lifecycle, all composing export/import:

| Function | Purpose |
|---|---|
| `exportCompany` | Serialize the whole company to a secret-free bundle. |
| `importCompany` | Rehydrate under a target company_id (via the audited `importWorkforce` path); derived views recompute; marketplace assets returned as a provisioning plan. |
| `backupCompany` | A `BackupPackage` — a bundle + integrity checksum + retention metadata. |
| `cloneCompany` | Export a source and import under a NEW company_id on the SAME instance. |
| `prepareDeployment` | A `DeploymentPackage` — bundle + manifest (checksum, connector re-consent + marketplace provisioning requirements) for standing the company up on ANOTHER AIOS instance. |
| `hashBundle` | Deterministic FNV-1a integrity checksum over a bundle. |
| `validateBundle` | Schema-compatibility guard before import. |

## Security
Bundles carry **configuration + knowledge only — never secrets/tokens**. Connector
bindings are config-only; the operator re-consents credentials in the target after
import/deploy.

## Held (Founder-gated)
Full-fidelity writers for any envelope section lacking an import path today, and
cross-instance transport/orchestration, land as their writers/migrations are
approved. What ships now is complete and secret-free for identity + brain + skills
+ derived views + marketplace provisioning plan, with export/import/backup/clone/
deploy entry points.
