#!/usr/bin/env bash
set -euo pipefail

# Runtime R1 Epic E2 verification scaffolding.
# This script intentionally requires Azure credentials and deployed resources.

usage() {
  cat <<USAGE
Usage: $0 --resource-group <rg> --namespace <service-bus-namespace>

Verifies expected queue/topic/subscription topology and key policy settings.
USAGE
}

RESOURCE_GROUP=""
NAMESPACE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
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

if [[ -z "$RESOURCE_GROUP" || -z "$NAMESPACE" ]]; then
  usage
  exit 1
fi

cat <<MSG
Topology verification scaffolding is ready.

Recommended checks:
1. List queues and verify all required names exist.
2. Verify queue TTL / maxDeliveryCount / deadLetterOnExpiration / duplicate detection settings.
3. Verify execution topic and required subscriptions exist.
4. Verify diagnostics setting targets Log Analytics.
5. Capture evidence for Gate B checklist.
MSG
