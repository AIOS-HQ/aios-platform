# Portable Company

Expands **Portable Workforce** into a whole **deployable company**. The objective:
an entire autonomous company exports and imports together, redeployable to
another AIOS instance with minimal manual setup.

Module: `src/lib/company/portable-company.ts` (server-only, additive, inert —
explicit entry points, no automatic caller).

## A company IS its Envelope + brain + skills
`exportCompany(userId, companyId, { marketplaceAssets? })` composes existing
read-models (nothing is mutated) into a `PortableCompanyBundle`:

| Section | Source | Notes |
|---|---|---|
| Company identity | `WorkforcePackage` (envelope) | The 30-section Company Context Envelope: **branding, governance, policies, founder settings, departments, objectives, projects, dashboards, reports, connector bindings (config-only)**. |
| Knowledge / Memory | Julius entries (in the package) | knowledge · decision · objective · activity. |
| Skills | Company skills (in the package) | Ride along; structured re-scoring resumes as work recurs. |
| Digital Twin | `buildDigitalTwin` | Derived operating model; recomputes in the target. |
| Ledger | `getCompanyFinancialSnapshot` | Point-in-time snapshot; recomputes in the target. |
| Marketplace assets | caller-supplied refs | Re-provisioned in the target once available. |

## Import
`importCompany(userId, targetCompanyId, bundle)`:
1. `validateBundle` (schema compatibility) — aborts cleanly on mismatch.
2. Restores the full envelope identity + Julius memory via the audited
   `importWorkforce` path (owner-scoped, RLS).
3. Digital Twin + Ledger are **not written** — they recompute from the restored
   envelope in the target.
4. Marketplace assets are returned as a **provisioning plan**
   (`marketplaceAssetsToProvision`) — installation persistence is Founder-gated.

## Security
Bundles carry **configuration + knowledge only — never secrets/tokens**.
Connector bindings are config-only; the operator re-consents credentials in the
target company after import.

## Held (Founder-gated)
Full-fidelity writers for any envelope sections lacking an import path today, and
cross-AIOS-instance transfer, land as their writers/migrations are approved. What
ships now is complete and secret-free for the identity + brain + skills + derived
views + marketplace provisioning plan.
