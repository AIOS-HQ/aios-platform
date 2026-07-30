#!/usr/bin/env bash
set -euo pipefail

# Runtime R1 Epic E1 negative authorization scaffolding.
# This script intentionally requires Azure credentials and deployed resources.

usage() {
  cat <<USAGE
Usage: $0 --resource-group <rg> --keyvault <kv-name>

Validates expected deny behavior for least-privilege role assignments.
Current scope (Epic E1): Key Vault secret access should be restricted to assigned identities only.
USAGE
}

RESOURCE_GROUP=""
KEYVAULT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --keyvault)
      KEYVAULT="$2"
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

if [[ -z "$RESOURCE_GROUP" || -z "$KEYVAULT" ]]; then
  usage
  exit 1
fi

cat <<MSG
Negative authorization test scaffolding is ready.

Recommended checks:
1. Attempt Key Vault secret read as unassigned principal -> expect AccessDenied.
2. Attempt Key Vault secret write as runtime MI principal -> expect AccessDenied.
3. Verify no Owner/Contributor role assignment exists for runtime MIs.
4. Verify each runtime MI can only perform Key Vault secret read.

Capture output evidence in Gate A validation artifacts.
MSG
