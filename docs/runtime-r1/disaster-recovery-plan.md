# Runtime R1 Disaster Recovery Plan

## Recovery Objectives
- RTO and RPO targets must be defined and approved per environment before production cutover.

## DR Scenarios
- Regional outage
- Service Bus outage
- Container Apps outage
- Key Vault outage
- Supabase outage
- Foundry outage
- GitHub outage

## Recovery Procedures
### Regional Failure
1. Enter execution pause mode.
2. Validate dependency status and failover readiness.
3. Restore service dependencies in designated recovery region.
4. Re-enable execution after validation gates.

### Service Bus Recovery
1. Pause consumers.
2. Verify namespace and queue health.
3. Validate DLQ state.
4. Replay eligible messages.

### Container Apps Recovery
1. Roll back to last stable revision.
2. Validate probes and scaling.
3. Resume traffic progressively.

### Key Vault Recovery
1. Validate access path and secret availability.
2. Execute emergency secret rotation if compromise suspected.
3. Re-validate runtime token flows.

## Validation After Recovery
- Approval boundary integrity
- Queue consistency
- Execution ledger consistency
- Observability coverage
- Security/audit event continuity
