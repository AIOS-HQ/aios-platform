#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_BASE="${1:-$ROOT_DIR/docs/runtime-r1/evidence/runs}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$OUT_BASE/gate-pack-$STAMP"

mkdir -p "$OUT_DIR"
cp "$ROOT_DIR/docs/runtime-r1/evidence/gate-evidence-template.md" "$OUT_DIR/README.md"

for gate in GateA GateB GateC GateD GateE; do
  mkdir -p "$OUT_DIR/$gate"
  cp "$ROOT_DIR/docs/runtime-r1/evidence/gate-checklists/${gate}.md" "$OUT_DIR/$gate/checklist.md"
  cat > "$OUT_DIR/$gate/evidence-links.md" <<GATE
# ${gate} Evidence Links

- Build output:
- Validate output:
- What-if output:
- Verification output:
- Approval record:
GATE
done

echo "Gate evidence package created: $OUT_DIR"
