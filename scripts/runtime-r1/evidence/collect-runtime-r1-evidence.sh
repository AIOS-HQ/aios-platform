#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_BASE="${1:-$ROOT_DIR/docs/runtime-r1/evidence/runs}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$OUT_BASE/run-$STAMP"

mkdir -p "$OUT_DIR/validation" "$OUT_DIR/gates" "$OUT_DIR/inventory"

run_or_record() {
  local name="$1"
  shift
  local out="$OUT_DIR/validation/${name}.txt"
  {
    echo "# Command"
    printf '%q ' "$@"
    echo
    echo
    echo "# Output"
    "$@"
  } >"$out" 2>&1
}

record_status() {
  local name="$1"
  local status="$2"
  local reason="$3"
  local out="$OUT_DIR/validation/${name}.txt"
  {
    echo "# Status"
    echo "$status"
    echo
    echo "# Reason"
    echo "$reason"
  } >"$out"
}

run_or_record "placeholder-scan" "$ROOT_DIR/scripts/runtime-r1/evidence/scan-placeholders.sh"
run_or_record "cross-epic-deps" "$ROOT_DIR/scripts/runtime-r1/evidence/validate-cross-epic-deps.sh"
run_or_record "artifact-presence" "$ROOT_DIR/scripts/runtime-r1/evidence/verify-runtime-r1-artifacts.sh"

if command -v az >/dev/null 2>&1; then
  run_or_record "az-version" az version
  run_or_record "e1-bicep-build" az bicep build --file "$ROOT_DIR/infra/runtime-r1/identity/main.bicep"
  run_or_record "e2-bicep-build" az bicep build --file "$ROOT_DIR/infra/runtime-r1/messaging/main.bicep"
  run_or_record "e3-bicep-build" az bicep build --file "$ROOT_DIR/infra/runtime-r1/observability/main.bicep"
  run_or_record "e4-bicep-build" az bicep build --file "$ROOT_DIR/infra/runtime-r1/compute/main.bicep"
else
  record_status "az-version" "SKIPPED" "Required tool not found: az"
  record_status "e1-bicep-build" "SKIPPED" "Required tool not found: az"
  record_status "e2-bicep-build" "SKIPPED" "Required tool not found: az"
  record_status "e3-bicep-build" "SKIPPED" "Required tool not found: az"
  record_status "e4-bicep-build" "SKIPPED" "Required tool not found: az"
fi

cp "$ROOT_DIR/docs/runtime-r1/evidence/gate-evidence-template.md" "$OUT_DIR/gates/gate-evidence-template.md"
cp "$ROOT_DIR/docs/runtime-r1/evidence/runtime-r1-resource-inventory-template.md" "$OUT_DIR/inventory/resource-inventory-template.md"

cat > "$OUT_DIR/summary.md" <<SUMMARY
# Runtime R1 Evidence Pack

- Generated: $STAMP (UTC)
- Root: $ROOT_DIR

## Included
- Validation command outputs under: $OUT_DIR/validation
- Gate placeholders under: $OUT_DIR/gates
- Inventory placeholders under: $OUT_DIR/inventory

## Notes
- This script is Azure-safe by default: it performs no deployment operations.
- If Azure CLI is unavailable, Azure checks are marked as skipped with explicit reason.
SUMMARY

echo "Evidence package created: $OUT_DIR"
