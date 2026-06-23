# Julius Wiring Report

Wires Julius (the AIOS organizational brain) into the AIOS workforce. Builds on
the company-scoped `julius_entries` table + `src/lib/julius/service.ts`.

## Agent-facing API (`src/lib/julius/wiring.ts`)

- **Read** — `juliusRecall(userId, companyId, query?, limit?)`: shared context an
  agent reads before acting.
- **Write** — `juliusRemember({ userId, companyId, agent, kind, title, content, … })`:
  an agent records relevant work (memory/decision/objective/activity) to the brain.
- **Cross-agent awareness** — `getJuliusAwareness(userId, companyId)`: a unified
  recent view (objectives, decisions, activities, knowledge) so every agent
  understands the others' work.
- **Company resolution** — `resolvePrimaryCompanyId()` keeps writes company-scoped.

## Coverage of the approved requirements

| Requirement | Mechanism |
|---|---|
| Agent read access to Julius context | `juliusRecall` / `getJuliusContext` |
| Agent write access to Julius memory | `juliusRemember` / `recordJuliusEntry` |
| Cross-agent awareness | `getJuliusAwareness` (objective/decision/activity/knowledge) |
| Shared objective awareness | `kind: "objective"` entries |
| Shared decision awareness | `kind: "decision"` entries |
| Shared activity awareness | `kind: "activity"` entries |

## First live integration — Auditor ↔ Julius

The Auditor agent demonstrates the wiring end-to-end: it can **write** its audit
posture to Julius (`recordAuditToJulius` → `juliusRemember`, `agent: "auditor"`,
`kind: "activity"`), making the rest of the workforce aware of the latest risk
state. Any agent reads it back via `juliusRecall` / `getJuliusAwareness`.

## Isolation & governance

- **Company-scoped**: every read/write is filtered by `company_id` — AIOS and
  AirBid brains never mix; AirBid memory cannot enter Julius.
- **Owner-private RLS** (`auth.uid() = user_id`), matching the platform pattern.
- **Atlas is steward** (`JULIUS.steward = "atlas"`); all read_write agents contribute.

## Operational status

Service + wiring ship green. Becomes live once `20260608000000_julius.sql` is
applied. Until then, reads return empty and writes no-op gracefully (no crashes).
Next: broaden auto-capture (objectives/approvals → Julius) and add a company-scoped
Julius review surface under `/harmony`.
