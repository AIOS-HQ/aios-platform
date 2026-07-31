# Runtime R1 — Epic E1 Service Identity Provisioning

This directory contains Azure Bicep templates for Runtime R1 Epic E1.

## Epic Scope
Implemented in this epic:
- User-assigned managed identities for runtime services.
- Key Vault least-privilege secret-read RBAC assignments.
- Container Apps identity binding plan outputs (preparation only).
- Environment parameterization for dev/stg/prod.
- Validation and negative-test script scaffolding.

Not implemented in this epic:
- Runtime services deployment
- Service Bus / queues
- Telemetry resources
- Runtime orchestration logic

## Structure

```
infra/runtime-r1/identity/
  main.bicep
  modules/
    managed-identities.bicep
    keyvault-access-rbac.bicep
    aca-identity-bindings.bicep
  parameters/
    dev.bicepparam
    stg.bicepparam
    prod.bicepparam
  rbac-matrix.md
```

## Prerequisites
- Azure CLI with Bicep support.
- Target subscription and resource group.
- Existing Key Vault (`keyVaultName`).

## Gate A DEV Baseline (validated environment)

- Subscription ID: `a4cef627-4392-430a-89d7-143d95880c55`
- Tenant ID: `db89245c-32e3-4980-8b7c-67e1d74a1382`
- Resource Group: `aios-core-rg`
- Region: `eastus`
- Key Vault: `aioshq-keyvalt`
- Key Vault URI: `https://aioshq-keyvalt.vault.azure.net/`
- Existing ACA environment: `managedEnvironment-aioscorerg-a01d`
- Existing Container App (known): `aios-runtime`

`parameters/dev.bicepparam` is prepared for this baseline. Unknown runtime app IDs
for `executionApi`, `mason`, `julius`, `workerRuntime`, and `futureRuntime`
remain intentionally empty strings until those apps are created/identified.

## Required Azure Permissions (minimum)
- `Managed Identity Contributor` on target resource group.
- `Role Based Access Control Administrator` (or equivalent role assignment permissions) on target scopes.
- Read access to target Key Vault resource metadata.

## Naming Convention
Default identity names are generated from:
- `namePrefix = aios-r1-<env>`

Resulting identities:
- `aios-r1-<env>-mi-harmony`
- `aios-r1-<env>-mi-execution-api`
- `aios-r1-<env>-mi-mason`
- `aios-r1-<env>-mi-julius`
- `aios-r1-<env>-mi-worker-runtime`
- `aios-r1-<env>-mi-future-runtime`

## Deployment (when credentials are available)

Validate compile:
```bash
./scripts/runtime-r1/identity/validate.sh --environment dev --resource-group aios-core-rg
```

What-if preview:
```bash
./scripts/runtime-r1/identity/validate.sh --environment dev --resource-group aios-core-rg --what-if
```

Deploy:
```bash
az deployment group create \
  --resource-group <rg> \
  --name r1-e1-identity-<timestamp> \
  --template-file infra/runtime-r1/identity/main.bicep \
  --parameters @infra/runtime-r1/identity/parameters/dev.bicepparam
```

## Validation Procedure
1. Compile and lint Bicep.
2. Run what-if to inspect identity + RBAC changes.
3. Validate identity creation and principal IDs.
4. Validate Key Vault role assignments.
5. Run negative authorization checks from script scaffolding.

## Rollback Procedure
- Remove role assignments created by this deployment.
- Remove user-assigned managed identities created by this deployment.
- Re-run validation to confirm no residual RBAC grants remain.

## Gate A Evidence Checklist
- [ ] Bicep compile successful
- [ ] What-if output reviewed and approved
- [ ] Managed identities created with expected names
- [ ] Key Vault secret-read role assignments applied as matrix-defined
- [ ] Unauthorized access test evidence captured
- [ ] No Owner/Contributor assignments introduced
