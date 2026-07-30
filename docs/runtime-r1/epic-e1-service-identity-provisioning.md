# Runtime R1 — Epic E1 Service Identity Provisioning

## Executive Intent
Epic E1 implements the service identity foundation for Runtime R1 using Azure Bicep.

## Architecture Alignment
- ADR-001 Runtime Architecture
- ADR-002 AI Agent Contracts
- ADR-003 Azure Resource Provisioning & Deployment Plan
- ADR-004 IaC Standard (Azure Bicep)

## Implemented Artifacts
- Managed identity module
- Key Vault RBAC assignment module
- ACA identity binding plan module
- Environment parameter files
- Validation and negative-test scaffolding scripts
- RBAC matrix documentation

## Azure Resources in Scope
- Microsoft.ManagedIdentity/userAssignedIdentities
- Microsoft.Authorization/roleAssignments
- Existing Microsoft.KeyVault/vaults (reference only)

## Out of Scope
- Queue infrastructure
- Runtime services
- Service Bus
- Telemetry
- Orchestration logic

## Validation Steps
1. `az bicep build` on `infra/runtime-r1/identity/main.bicep`
2. `az deployment group validate` with env parameter file
3. Optional `what-if` review before deployment
4. Negative authorization checks from script scaffolding

## Required Evidence for Gate A
- Build output
- Validate output
- What-if output
- Identity list and principal IDs
- Role assignment list
- Negative access test log

## Rollback Summary
1. Remove Key Vault RBAC role assignments created by deployment.
2. Delete managed identities created by deployment.
3. Re-run validation scripts to confirm cleanup.
