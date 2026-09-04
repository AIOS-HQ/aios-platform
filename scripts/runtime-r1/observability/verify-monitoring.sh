#!/usr/bin/env bash
set -euo pipefail

# Runtime R1 Epic E3 verification scaffolding.
# This script intentionally requires Azure credentials and deployed resources.

usage() {
  cat <<USAGE
Usage: $0 --resource-group <rg>

Verifies expected observability topology and baseline alert/diagnostic resources.
USAGE
}

RESOURCE_GROUP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$RESOURCE_GROUP" ]]; then
  usage
  exit 1
fi

cat <<MSG
Monitoring verification scaffolding is ready.

Recommended checks:
1. Verify Log Analytics workspace and retention policy.
2. Verify Application Insights is workspace-based.
3. Verify Action Group and receivers.
4. Verify metric alerts exist and are enabled.
5. Verify diagnostics attached to configured scopes.
6. Verify workbook exists for runtime observability baseline.
7. Capture evidence for Gate C checklist.
MSG
