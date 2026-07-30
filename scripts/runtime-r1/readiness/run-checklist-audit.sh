#!/usr/bin/env bash
set -euo pipefail

cat <<MSG
Runtime R1 checklist audit scaffold is ready.

Manual audit procedure:
1. Review all checklists in docs/runtime-r1/checklists.
2. Confirm evidence links are attached for each checked item.
3. Record unresolved blockers.
4. Escalate blockers before Gate E approval.

Note: This script intentionally does not mark checklist items complete.
MSG
