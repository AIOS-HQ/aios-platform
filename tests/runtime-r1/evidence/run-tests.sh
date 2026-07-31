#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIXTURE_ROOT="$ROOT_DIR/tests/runtime-r1/evidence/fixtures"
TEMP_DIR="$ROOT_DIR/tests/runtime-r1/evidence/tmp"

mkdir -p "$TEMP_DIR"
rm -rf "$TEMP_DIR"/*

cp -R "$FIXTURE_ROOT"/. "$TEMP_DIR"/
mkdir -p "$TEMP_DIR/scripts/runtime-r1/evidence" "$TEMP_DIR/docs/runtime-r1/evidence/gate-checklists"
cp "$ROOT_DIR/scripts/runtime-r1/evidence/"*.sh "$TEMP_DIR/scripts/runtime-r1/evidence/"
cp "$ROOT_DIR/docs/runtime-r1/evidence/artifact-manifest.txt" "$TEMP_DIR/docs/runtime-r1/evidence/artifact-manifest.txt"
cp "$ROOT_DIR/docs/runtime-r1/evidence/cross-epic-dependencies.tsv" "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies.tsv"
cp "$ROOT_DIR/docs/runtime-r1/evidence/gate-evidence-template.md" "$TEMP_DIR/docs/runtime-r1/evidence/gate-evidence-template.md"
cp "$ROOT_DIR/docs/runtime-r1/evidence/runtime-r1-resource-inventory-template.md" "$TEMP_DIR/docs/runtime-r1/evidence/runtime-r1-resource-inventory-template.md"
cp "$ROOT_DIR/docs/runtime-r1/evidence/gate-checklists/"*.md "$TEMP_DIR/docs/runtime-r1/evidence/gate-checklists/"

run_expect_pass() {
  local desc="$1"; shift
  echo "PASS-TEST: $desc"
  "$@" >/dev/null
}

run_expect_fail() {
  local desc="$1"; shift
  echo "FAIL-TEST: $desc"
  if "$@" >/dev/null 2>&1; then
    echo "Expected failure but passed: $desc"
    exit 1
  fi
}

run_expect_pass "placeholder scan passes" "$TEMP_DIR/scripts/runtime-r1/evidence/scan-placeholders.sh" "$TEMP_DIR/infra/runtime-r1"

printf "param x string = '<placeholder>'\n" > "$TEMP_DIR/infra/runtime-r1/identity/bad.bicep"
run_expect_fail "placeholder scan fails on unresolved placeholder" "$TEMP_DIR/scripts/runtime-r1/evidence/scan-placeholders.sh" "$TEMP_DIR/infra/runtime-r1"
rm "$TEMP_DIR/infra/runtime-r1/identity/bad.bicep"

run_expect_pass "artifact verification passes" "$TEMP_DIR/scripts/runtime-r1/evidence/verify-runtime-r1-artifacts.sh" "$TEMP_DIR/docs/runtime-r1/evidence/artifact-manifest.txt"
rm "$TEMP_DIR/infra/runtime-r1/identity/main.bicep"
run_expect_fail "artifact verification fails with missing file" "$TEMP_DIR/scripts/runtime-r1/evidence/verify-runtime-r1-artifacts.sh" "$TEMP_DIR/docs/runtime-r1/evidence/artifact-manifest.txt"
cp "$FIXTURE_ROOT/infra/runtime-r1/identity/main.bicep" "$TEMP_DIR/infra/runtime-r1/identity/main.bicep"

run_expect_pass "cross-epic validation passes" "$TEMP_DIR/scripts/runtime-r1/evidence/validate-cross-epic-deps.sh" "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies.tsv"
cp "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies.tsv" "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies-bad.tsv"
sed -i '' 's/managedIdentityResourceIds/managedIdentityResourceIdsX/' "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies-bad.tsv"
run_expect_fail "cross-epic validation fails on bad mapping" "$TEMP_DIR/scripts/runtime-r1/evidence/validate-cross-epic-deps.sh" "$TEMP_DIR/docs/runtime-r1/evidence/cross-epic-dependencies-bad.tsv"

run_expect_pass "gate package generation" "$TEMP_DIR/scripts/runtime-r1/evidence/package-gate-evidence.sh" "$TEMP_DIR/docs/runtime-r1/evidence/runs"
first_pack="$(find "$TEMP_DIR/docs/runtime-r1/evidence/runs" -maxdepth 1 -type d -name 'gate-pack-*' | sort | tail -n1)"
[[ -n "$first_pack" ]]

run_expect_pass "full evidence collection" "$TEMP_DIR/scripts/runtime-r1/evidence/collect-runtime-r1-evidence.sh" "$TEMP_DIR/docs/runtime-r1/evidence/runs"
first_run="$(find "$TEMP_DIR/docs/runtime-r1/evidence/runs" -maxdepth 1 -type d -name 'run-*' | sort | tail -n1)"
[[ -n "$first_run" ]]
[[ -f "$first_run/summary.md" ]]

sleep 1
run_expect_pass "full evidence collection repeat" "$TEMP_DIR/scripts/runtime-r1/evidence/collect-runtime-r1-evidence.sh" "$TEMP_DIR/docs/runtime-r1/evidence/runs"
second_run="$(find "$TEMP_DIR/docs/runtime-r1/evidence/runs" -maxdepth 1 -type d -name 'run-*' | sort | tail -n1)"
[[ "$first_run" != "$second_run" ]]

echo "ALL TESTS PASSED"
