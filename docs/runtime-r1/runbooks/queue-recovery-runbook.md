# Queue Recovery Runbook

## Trigger Conditions
- Persistent backlog growth
- DLQ growth spikes
- Consumer failures

## Procedure
1. Pause affected consumers.
2. Inspect queue metrics and DLQ contents.
3. Resolve upstream issue.
4. Replay eligible messages.
5. Resume consumers gradually.
6. Validate execution and ledger consistency.
