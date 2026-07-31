#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/infra/runtime-r1}"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Result: FAIL (target directory not found: $TARGET_DIR)"
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "Result: FAIL (ripgrep 'rg' is required)"
  exit 2
fi

PATTERN='<[a-zA-Z0-9._-]+>'

echo "Scanning for unresolved placeholders in: $TARGET_DIR"

matches=0
while IFS= read -r file; do
  if rg -n "$PATTERN" "$file" >/dev/null 2>&1; then
    echo "PLACEHOLDER_FOUND: $file"
    rg -n "$PATTERN" "$file"
    matches=$((matches + 1))
  fi
done < <(find "$TARGET_DIR" -type f \( -name '*.bicepparam' -o -name '*.bicep' -o -name '*.md' \) | sort)

if [[ $matches -gt 0 ]]; then
  echo "Result: FAIL ($matches file(s) contain placeholders)"
  exit 2
fi

echo "Result: PASS (no placeholders detected)"
