# Deployment Runbook

## Purpose
Standard procedure for controlled Runtime R1 deployment.

## Steps
1. Verify prerequisites and gate dependencies.
2. Execute dry-run validation (`build`, `validate`, `what-if`).
3. Apply in approved deployment order (E1->E4).
4. Execute post-deployment validation checks.
5. Record deployment evidence and status.

## Abort Conditions
- Validation failures
- Unauthorized permission drift
- Missing core dependency readiness
