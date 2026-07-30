# Runtime R1 — Epic E4 Runtime Compute & Orchestration Services

## Executive Intent
Epic E4 defines deployable Azure Container Apps compute topology artifacts for Runtime R1 using Azure Bicep.

## Architecture Alignment
- ADR-001 Runtime Architecture
- ADR-002 AI Agent Contracts
- ADR-003 Azure Resource Provisioning & Deployment Plan
- ADR-004 IaC Standard (Azure Bicep)

## Implemented Artifacts
- ACA environment module
- Reusable container app service module
- Runtime service topology composition in main template
- Environment parameter files
- Validation and topology verification scripts
- Epic documentation and Gate D checklist

## Runtime Services Modeled
- Harmony
- Execution API
- Mason
- Julius
- Worker Runtime
- Future Runtime service placeholder

## Compute Configuration Coverage
- Identity attachment per service (user-assigned MI)
- Parameterized CPU/memory
- Parameterized min/max replica bounds
- Ingress external/internal settings
- Health probes (startup/readiness/liveness)
- Revision mode settings
- Queue-scaling hooks scaffold for future queue auth wiring

## Validation Steps
1. `az bicep build` on `infra/runtime-r1/compute/main.bicep`
2. `az deployment group validate` with env parameter file
3. Optional `what-if` review before deployment
4. Run runtime topology verification script scaffold after deployment

## Required Evidence for Gate D
- Build output
- Validate output
- What-if output
- ACA environment resource snapshot
- Container app list + identity configuration snapshot
- Ingress/scaling/probe/revision snapshot per service

## Rollback Summary
1. Roll back app revisions to last known stable revisions.
2. Remove newly introduced container apps if required.
3. Remove ACA environment only after all dependent apps are removed.
