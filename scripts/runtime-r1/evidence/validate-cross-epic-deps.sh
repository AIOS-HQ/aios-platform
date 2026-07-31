#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MAPPING_FILE="${1:-$ROOT_DIR/docs/runtime-r1/evidence/cross-epic-dependencies.tsv}"

if [[ ! -f "$MAPPING_FILE" ]]; then
  echo "Result: FAIL (mapping file not found: $MAPPING_FILE)"
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "Result: FAIL (ripgrep 'rg' is required)"
  exit 2
fi

fail=0
while IFS=$'\t' read -r source destination file_rel pattern description; do
  [[ -z "$source" || "$source" =~ ^# ]] && continue

  file_path="$ROOT_DIR/$file_rel"
  if [[ ! -f "$file_path" ]]; then
    echo "MISSING_FILE: [$source->$destination] $file_rel ($description)"
    fail=1
    continue
  fi

  if rg -n -- "$pattern" "$file_path" >/dev/null 2>&1; then
    echo "OK: [$source->$destination] $description"
  else
    echo "MISSING_REF: [$source->$destination] $description"
    echo "  file: $file_rel"
    echo "  pattern: $pattern"
    fail=1
  fi
done < "$MAPPING_FILE"

if [[ $fail -ne 0 ]]; then
  echo "Result: FAIL (cross-epic dependency references incomplete)"
  exit 2
fi

echo "Result: PASS (cross-epic dependency references present)"
