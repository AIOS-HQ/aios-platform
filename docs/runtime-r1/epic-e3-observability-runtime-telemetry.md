# Runtime R1 — Epic E3 Observability & Runtime Telemetry

## Executive Intent
Epic E3 defines deployable Azure observability infrastructure artifacts for Runtime R1 using Azure Bicep.

## Architecture Alignment
- ADR-001 Runtime Architecture
- ADR-002 AI Agent Contracts
- ADR-003 Azure Resource Provisioning & Deployment Plan
- ADR-004 IaC Standard (Azure Bicep)

## Implemented Artifacts
- Log Analytics workspace module
- Application Insights module
- Action Group module
- Metric alert module
- Diagnostic settings module
- Workbook baseline module
- Environment parameter files
- Validation and monitoring verification scripts
- Epic documentation and Gate C checklist

## Observability Architecture Coverage
- Central telemetry storage via Log Analytics
- Application telemetry via workspace-based App Insights
- Alerting via Action Groups + metric alerts
- Infrastructure diagnostics for Service Bus, Key Vault, ACA environment
- Baseline workbook for runtime operations dashboarding

## Logging and Tracing Assumptions
- Runtime services emit structured logs and distributed traces to App Insights / Log Analytics.
- Correlation IDs and execution IDs are propagated by runtime services per ADR-002.
- This epic provisions infrastructure only; it does not instrument runtime code.

## Validation Steps
1. `az bicep build` on `infra/runtime-r1/observability/main.bicep`
2. `az deployment group validate` with env parameter file
3. Optional `what-if` review before deployment
4. Run monitoring verification script scaffold after deployment

## Required Evidence for Gate C
- Build output
- Validate output
- What-if output
- Workspace + App Insights resource snapshots
- Action group and alert list snapshots
- Diagnostic setting snapshots per scope
- Workbook resource snapshot

## Rollback Summary
1. Delete metric alerts.
2. Delete action group.
3. Remove diagnostics settings.
4. Delete workbook.
5. Delete App Insights component.
6. Delete Log Analytics workspace.
