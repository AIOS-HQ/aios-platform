# Runtime R1 — Epic E2 Messaging & Execution Backbone

This directory contains Azure Bicep templates for Runtime R1 Epic E2.

## Epic Scope
Implemented in this epic:
- Service Bus namespace definition
- Runtime queues for approved execution lifecycle
- Execution topic and subscriptions
- Retry/dead-letter/TTL/duplicate detection queue settings
- Namespace diagnostics configuration
- Environment parameterization for dev/stg/prod
- Validation script scaffolding and Gate B documentation

Not implemented in this epic:
- Runtime producers/consumers
- Application messaging code
- Service identity and RBAC beyond what messaging infra requires
- Runtime service deployment

## Structure

```
infra/runtime-r1/messaging/
  main.bicep
  modules/
    servicebus-namespace.bicep
    servicebus-queues.bicep
    servicebus-topic.bicep
    servicebus-diagnostics.bicep
  parameters/
    dev.bicepparam
    stg.bicepparam
    prod.bicepparam
```

## Queue Topology
- `execution-intents`
- `execution-events`
- `execution-results`
- `execution-validation`
- `approval-events`
- `health-events`

## Topic/Subscription Topology
- Topic: `execution-topic`
- Subscriptions:
  - `ledger-writer`
  - `observability`
  - `incident-automation`

## Deployment Prerequisites
- Azure CLI with Bicep support.
- Existing resource group.
- Optional existing Log Analytics workspace for diagnostics.

## Validation
```bash
./scripts/runtime-r1/messaging/validate.sh --environment dev --resource-group <rg>
./scripts/runtime-r1/messaging/validate.sh --environment dev --resource-group <rg> --what-if
```

## Rollback
- Delete topic subscriptions and topic
- Delete queues
- Delete diagnostics setting
- Delete Service Bus namespace

Run rollback only after confirming no active workloads depend on namespace resources.

## Gate B Evidence Checklist
- [ ] Bicep compile successful
- [ ] Template validation successful
- [ ] What-if reviewed and approved
- [ ] Queue names and settings match Sprint 2 topology
- [ ] Topic/subscription names and settings validated
- [ ] Diagnostics configuration validated
- [ ] No hardcoded tenant/subscription IDs in templates
