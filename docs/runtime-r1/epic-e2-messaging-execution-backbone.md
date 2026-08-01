# Runtime R1 — Epic E2 Messaging & Execution Backbone

## Executive Intent
Epic E2 defines deployable Azure messaging infrastructure artifacts for Runtime R1 using Azure Bicep.

## Architecture Alignment
- ADR-001 Runtime Architecture
- ADR-002 AI Agent Contracts
- ADR-003 Azure Resource Provisioning & Deployment Plan
- ADR-004 IaC Standard (Azure Bicep)

## Implemented Artifacts
- Service Bus namespace module
- Queue module
- Topic/subscription module
- Diagnostics module
- Environment parameter files
- Validation and topology verification scripts
- Epic documentation and Gate B checklist

## Queue Topology
- execution-intents
- execution-events
- execution-results
- execution-validation
- approval-events
- health-events

## Topic Topology
- execution-topic
  - ledger-writer
  - observability
  - incident-automation

## Retry / Dead-Letter Strategy (Infrastructure Defaults)
- Queue-level `maxDeliveryCount` configured per queue class.
- Dead-letter-on-message-expiration enabled.
- Message TTL set per queue (3/7/14 day classes).
- Duplicate detection enabled for queue and topic entities.

## Validation Steps
1. `az bicep build` on `infra/runtime-r1/messaging/main.bicep`
2. `az deployment group validate` with env parameter file
3. Optional `what-if` review before deployment
4. Run topology verification script scaffold after deployment

## Required Evidence for Gate B
- Build output
- Validate output
- What-if output
- Queue list + property snapshots
- Topic/subscription list + property snapshots
- Diagnostic settings snapshot

## Rollback Summary
1. Delete topic subscriptions and topic.
2. Delete queues.
3. Remove namespace diagnostics settings.
4. Delete Service Bus namespace.
