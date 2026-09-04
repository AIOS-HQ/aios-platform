#!/usr/bin/env bash
set -euo pipefail

# Runtime R1 Epic E4 verification scaffolding.
# This script intentionally requires Azure credentials and deployed resources.

usage() {
  cat <<USAGE
Usage: $0 --resource-group <rg>

Verifies expected runtime compute topology and service configuration.
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
Runtime topology verification scaffolding is ready.

Recommended checks:
1. Verify ACA environment exists and links to Log Analytics.
2. Verify each runtime service container app exists.
3. Verify per-service managed identity attachments.
4. Verify ingress exposure rules per service.
5. Verify scale bounds and probe configuration.
6. Verify revision mode settings.
7. Capture evidence for Gate D checklist.
MSG
