# DLQ Replay Runbook

## Preconditions
- Root cause identified and mitigated
- Replay window approved

## Procedure
1. Enumerate DLQ messages by correlation/execution id.
2. Classify replayable vs poison messages.
3. Requeue replayable messages with tracking metadata.
4. Validate downstream processing.
5. Archive replay report and evidence.
