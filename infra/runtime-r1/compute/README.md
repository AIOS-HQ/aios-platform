# Runtime R1 — Epic E4 Runtime Compute & Orchestration Services

This directory contains Azure Bicep templates for Runtime R1 Epic E4.

## Epic Scope
Implemented in this epic:
- Azure Container Apps Environment definition
- Runtime service container app definitions for:
  - Harmony
  - Execution API
  - Mason
  - Julius
  - Worker Runtime
  - Future Runtime Service (reserved)
- Managed identity attachment per service
- ACR pull integration settings
- Key Vault secret reference pattern placeholders
- Ingress, scaling, and health probe configuration
- Revision mode parameterization
- Queue-scaling hooks scaffolding for future queue bindings

Not implemented in this epic:
- Runtime service code
- Queue infrastructure provisioning
- Runtime orchestration business logic
- Actual Azure deployments

## Structure

```
infra/runtime-r1/compute/
  main.bicep
  modules/
    container-apps-environment.bicep
    container-app-service.bicep
  parameters/
    dev.bicepparam
    stg.bicepparam
    prod.bicepparam
```

## Architecture Notes
- Each runtime service has a dedicated user-assigned managed identity.
- Services are independently parameterized for CPU, memory, replica bounds, and ingress.
- Key Vault integration is modeled via secret/env references only (no plaintext secrets).
- Queue-based scale rules are scaffolding only and require queue auth wiring in later epics.

## Deployment Prerequisites
- Azure CLI with Bicep support.
- Existing Log Analytics workspace (Epic E3).
- Existing managed identities (Epic E1).
- Existing ACR and image repositories.
- Existing Key Vault.

## Validation
```bash
./scripts/runtime-r1/compute/validate.sh --environment dev --resource-group <rg>
./scripts/runtime-r1/compute/validate.sh --environment dev --resource-group <rg> --what-if
```

## Rollback
- Roll back Container App revisions to prior stable versions.
- Remove newly created Container Apps if required.
- Remove ACA environment only after confirming no dependent apps remain.

## Gate D Evidence Checklist
- [ ] Bicep compile successful
- [ ] Template validation successful
- [ ] What-if reviewed and approved
- [ ] ACA environment output references validated
- [ ] Runtime service definitions validated (identity, ingress, scaling, probes)
- [ ] Revision mode and resource sizing verified
- [ ] No hardcoded subscription/tenant IDs in templates
