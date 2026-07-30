# Runtime R1 Epic E1 — RBAC Matrix

## Scope
This matrix defines least-privilege role assignments introduced in Epic E1 only.

## Role Assignments

| Principal | Azure Resource Scope | Role | Purpose |
| --- | --- | --- | --- |
| `harmony` MI | Key Vault | Key Vault Secrets User | Retrieve runtime secrets without write privileges |
| `executionApi` MI | Key Vault | Key Vault Secrets User | Retrieve execution API secrets without write privileges |
| `mason` MI | Key Vault | Key Vault Secrets User | Retrieve orchestration secrets without write privileges |
| `julius` MI | Key Vault | Key Vault Secrets User | Retrieve validation secrets without write privileges |
| `workerRuntime` MI | Key Vault | Key Vault Secrets User | Retrieve worker secrets without write privileges |
| `futureRuntime` MI | Key Vault | Key Vault Secrets User | Reserved identity for future runtime service secret retrieval |

## Explicit Non-Goals
- No Owner role assignments.
- No Contributor role assignments.
- No Service Bus, Storage, Foundry, or Monitor RBAC assignments in Epic E1.

Those will be implemented in subsequent approved epics/workstreams.
