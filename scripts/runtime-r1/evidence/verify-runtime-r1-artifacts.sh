#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST_PATH="${1:-$ROOT_DIR/docs/runtime-r1/evidence/artifact-manifest.txt}"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Result: FAIL (manifest not found: $MANIFEST_PATH)"
  exit 2
fi

missing=0
while IFS= read -r rel; do
  [[ -z "$rel" || "$rel" =~ ^# ]] && continue
  path="$ROOT_DIR/$rel"
  if [[ -f "$path" ]]; then
    echo "OK: $rel"
  else
    echo "MISSING: $rel"
    missing=$((missing + 1))
  fi
done < "$MANIFEST_PATH"

if [[ $missing -gt 0 ]]; then
  echo "Result: FAIL ($missing required artifact(s) missing)"
  exit 2
fi

echo "Result: PASS (all required Runtime R1 artifacts present)"
