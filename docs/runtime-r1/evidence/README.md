# Runtime R1 Evidence Automation

## Scripts
- `scripts/runtime-r1/evidence/scan-placeholders.sh`
- `scripts/runtime-r1/evidence/verify-runtime-r1-artifacts.sh`
- `scripts/runtime-r1/evidence/validate-cross-epic-deps.sh`
- `scripts/runtime-r1/evidence/package-gate-evidence.sh`
- `scripts/runtime-r1/evidence/collect-runtime-r1-evidence.sh`

## Quick Start
Run full evidence collection (Azure-safe):

```bash
scripts/runtime-r1/evidence/collect-runtime-r1-evidence.sh
```

This command performs repository-only checks and creates timestamped evidence under `docs/runtime-r1/evidence/runs/`.
