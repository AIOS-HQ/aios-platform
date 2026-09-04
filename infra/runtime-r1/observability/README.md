# Runtime R1 — Epic E3 Observability & Runtime Telemetry

This directory contains Azure Bicep templates for Runtime R1 Epic E3.

## Epic Scope
Implemented in this epic:
- Log Analytics Workspace
- Application Insights (workspace-based)
- Action Group definitions
- Metric Alerts (critical and warning)
- Diagnostic settings for key runtime infrastructure scopes
- Workbook baseline template for runtime operations
- Environment parameterization (dev/stg/prod)
- Validation and verification script scaffolding

Not implemented in this epic:
- Runtime code instrumentation
- Application logging implementation
- Runtime service deployment
- Queue/runtime business logic

## Structure

```
infra/runtime-r1/observability/
  main.bicep
  modules/
    log-analytics.bicep
    application-insights.bicep
    action-group.bicep
    metric-alerts.bicep
    diagnostic-settings.bicep
    workbook-template.bicep
  parameters/
    dev.bicepparam
    stg.bicepparam
    prod.bicepparam
```

## Monitoring Architecture Coverage
- Runtime telemetry sink: Log Analytics + App Insights
- Alert action routing: Monitor Action Group
- Infrastructure diagnostics:
  - Service Bus namespace
  - Key Vault
  - Container Apps environment
- Baseline alert categories:
  - request failures
  - latency degradation
  - queue backlog/deadletter growth
  - key vault service failures

## Deployment Prerequisites
- Azure CLI with Bicep support.
- Existing resource group.
- Existing service scopes (Service Bus, Key Vault, ACA env) if diagnostics are enabled.

## Validation
```bash
./scripts/runtime-r1/observability/validate.sh --environment dev --resource-group <rg>
./scripts/runtime-r1/observability/validate.sh --environment dev --resource-group <rg> --what-if
```

## Rollback
- Delete metric alerts
- Delete action groups
- Delete diagnostic settings
- Delete workbook
- Delete Application Insights
- Delete Log Analytics Workspace

## Gate C Evidence Checklist
- [ ] Bicep compile successful
- [ ] Template validation successful
- [ ] What-if reviewed and approved
- [ ] Log Analytics and App Insights output references validated
- [ ] Action group and alert resources validated
- [ ] Diagnostic settings mapped to target scopes
- [ ] Workbook baseline deployed
- [ ] No hardcoded subscription/tenant IDs in templates
