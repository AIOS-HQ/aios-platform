#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

required_files=(
  "$ROOT_DIR/docs/runtime-r1/epic-e5-production-readiness-operational-handoff.md"
  "$ROOT_DIR/docs/runtime-r1/operational-architecture.md"
  "$ROOT_DIR/docs/runtime-r1/production-cutover-plan.md"
  "$ROOT_DIR/docs/runtime-r1/disaster-recovery-plan.md"
  "$ROOT_DIR/docs/runtime-r1/backup-restore-plan.md"
  "$ROOT_DIR/docs/runtime-r1/hypercare-plan.md"
  "$ROOT_DIR/docs/runtime-r1/operational-ownership-matrix.md"
  "$ROOT_DIR/docs/runtime-r1/executive-acceptance-checklist.md"
  "$ROOT_DIR/docs/runtime-r1/runtime-r1-completion-report-template.md"
)

missing=0
for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file"
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  echo "Readiness package verification failed."
  exit 1
fi

echo "Runtime R1 readiness package structure verified."
