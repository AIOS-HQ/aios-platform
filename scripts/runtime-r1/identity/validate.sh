#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEMPLATE_FILE="$ROOT_DIR/infra/runtime-r1/identity/main.bicep"
PARAM_DIR="$ROOT_DIR/infra/runtime-r1/identity/parameters"

ENVIRONMENT=""
RESOURCE_GROUP=""
RUN_WHAT_IF="false"

usage() {
  cat <<USAGE
Usage: $0 --environment <dev|stg|prod> --resource-group <name> [--what-if]

Performs local Bicep validation for Runtime R1 Epic E1 templates.
This script does not deploy resources unless --what-if is used and Azure auth is available.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --what-if)
      RUN_WHAT_IF="true"
      shift
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

if [[ -z "$ENVIRONMENT" || -z "$RESOURCE_GROUP" ]]; then
  usage
  exit 1
fi

PARAM_FILE="$PARAM_DIR/${ENVIRONMENT}.bicepparam"
if [[ ! -f "$PARAM_FILE" ]]; then
  echo "Parameter file not found: $PARAM_FILE" >&2
  exit 1
fi

echo "==> Building bicep template"
az bicep build --file "$TEMPLATE_FILE" >/dev/null

echo "==> Validating deployment template"
az deployment group validate \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters "@$PARAM_FILE" >/dev/null

echo "Validation successful for environment: $ENVIRONMENT"

if [[ "$RUN_WHAT_IF" == "true" ]]; then
  echo "==> Running what-if"
  az deployment group what-if \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE_FILE" \
    --parameters "@$PARAM_FILE"
fi
