# AIOS Workforce, Julius & Company-Separation — Architecture & Audit

Status: Phase 1 + Phase 2 foundation implemented; Phase 3 audited (infra
separation is founder-executed). Owner: Alejandro Baez.

---

## 1. Workforce Audit Report (Phase 1)

**Method:** GitHub code search + reading `src/lib/harmony/os/*` and `WORKFORCE.md`
on `main`.

**Findings**

- The **named workforce** (Harmony, Atlas, Pulse, Ledger, Catalyst, Horizon,
  Aegis, plus the auditor/comms agents) previously existed **only in
  `WORKFORCE.md`** — there was **no code registry**. This is now fixed:
  `src/lib/workforce/registry.ts` is the code source of truth.
- The **OS layer** (`src/lib/harmony/os/catalog.ts`) instantiates **generic
  per-company department agents** (Engineering Manager, Coding Agent, YouTube
  Helper, …) into the `agents` table — a *separate* concept from the named
  workforce. Unchanged.
- **Julius** did not exist. Introduced in this initiative.

**Status of each official agent (per the founder directive)**

| Agent | Prior state | Now |
|---|---|---|
| Harmony | Implemented (assistant, OS, nav) | Registered |
| Auditor | Documented as *Verity* | Registered (aka Verity) |
| Catalyst | Documented | Registered |
| Ambassador | Documented as *Signal* | Registered (aka Signal) |
| Atlas | Documented | Registered + Julius steward |
| Pulse | Documented | Registered |
| Horizon | Documented | Registered |
| Aegis | Documented | Registered |
| Ledger | Documented | Registered |
| **Julius** | Absent | Implemented as the organizational brain (not an agent) |

**Reconciliation needed (founder decision):** the directive renames *Verity →
Auditor* and *Signal → Ambassador*, and drops the former *Forge* engineering
agent (engineering remains covered by the Code department). The registry + v2.0
WORKFORCE.md reflect the directive; confirm the renames/drop are intended.

---

## 2. Julius Architecture Report (Phase 2)

**Principle:** Julius is the AIOS organizational brain — shared across AIOS
agents, **company-scoped**, owner-private. It is *not* an agent.

**Implemented foundation**

- **Table** `public.julius_entries` (migration `20260608000000_julius.sql`):
  `user_id` + `company_id` scoped, `agent`, `kind`
  (objective/decision/document/activity/relationship/historical/context/knowledge),
  `title`, `content`, `refs` (jsonb), `importance`. RLS owner CRUD
  (`auth.uid() = user_id`), matching the platform's single-owner pattern.
  **Company isolation** is enforced by `company_id` in every query, so AIOS and
  AirBid brains never mix.
- **Service** `src/lib/julius/service.ts`: `recordJuliusEntry`,
  `listJuliusEntries`, and `getJuliusContext` (the cross-agent retrieval hook
  every agent reads before acting). Degrades gracefully until the migration is
  applied.
- **Stewardship:** Atlas is the primary curator (`JULIUS.steward = "atlas"`);
  all read_write agents contribute so the workforce stays mutually aware.

**Design note — builds on the existing OS, doesn't duplicate it.** Objectives,
activities, approvals, and agent-actions already exist company-scoped in the OS
layer. Julius is the durable *organizational memory/knowledge* layer on top;
the next step wires `getJuliusContext` into agent flows and aggregates the
existing objective/activity feeds into Julius "awareness" views.

**Operational status:** foundation ships green; becomes live once
`20260608000000_julius.sql` is applied (founder). Agent-flow wiring + a Julius
review surface are the next increments.

---

## 3. AIOS vs AirBid Separation Audit (Phase 3)

**Inspected:** GitHub (code search), the OS/data model, routes, branding,
documentation, agent + company references. (Supabase/Vercel/env vars are not
reachable from the engineering environment — see founder decisions.)

**Findings**

- The platform is a **single-owner, multi-company Operating System**: one
  Supabase database, `companies` rows owned by the founder (`user_id`), RLS
  scoped to the founder, separated by `company_id`. AirBid, if created, is a
  **company row in the same database** — not a separate system.
- **AirBid references in-repo are example/documentation only:** a company-creation
  placeholder ("e.g. AirBid") in `messages/{en,es}.json`, `PRD.md`/`WORKFORCE.md`
  statements that the companies are separate, the OS catalog comment, and a
  `slugify("AirBid")` unit test. **No AirBid operational code, data, agents, or
  deployment exists in this repo.**
- AirBid workforce names (Nexus, Sentinel, Guardian, Oracle, Compass) are
  reserved and now enforced in code (`isReservedAirbidName`).

**Conclusion — the hard requirement vs. the current architecture.** "AIOS and
AirBid must not share databases / repositories / deployments / environment
variables" is **incompatible** with the current single-DB multi-company design
*if AirBid is ever instantiated here.* True separation is an **infrastructure
decision only the founder can execute** (separate Supabase project, Vercel
project, repository, env vars, domain). It cannot — and should not — be done by
modifying application code, and tearing out multi-company support would be a
destructive change to existing functionality.

**Safe separations executed (this PR):**
- Workforce code registry that **reserves and blocks** AirBid names for AIOS.
- Julius is **company-scoped** so AirBid memory can never enter the AIOS brain.
- WORKFORCE.md reconciled to the official AIOS roster + reserved AirBid names.

**Not executed (intentionally):** removing the multi-company capability, deleting
the "e.g. AirBid" example, or splitting infrastructure — these depend on the
founder decision below.

---

## 4. Changes Executed

- `src/lib/workforce/registry.ts` — official AIOS workforce registry (code), with
  Julius (brain) and reserved AirBid names + guards.
- `supabase/migrations/20260608000000_julius.sql` — company-scoped Julius brain
  table (additive, idempotent, owner RLS). **Founder must apply.**
- `src/lib/julius/service.ts` — Julius read/write + cross-agent context service.
- `WORKFORCE.md` — reconciled to v2.0 (official roster + Julius + reserved names).
- This report.

No existing tables, OS code, connectors, approvals, Harmony flows, UI, or
AirBid-related code were modified. No i18n strings changed (EN/ES parity
unaffected).

---

## 5. Remaining Founder Decisions

1. **Workforce naming:** confirm *Verity → Auditor*, *Signal → Ambassador*, and
   dropping *Forge* (engineering handled by the Code department).
2. **Company separation model (the big one):** keep AIOS as a multi-company
   platform (AirBid as a company row), **or** split AirBid into its own Supabase
   project + Vercel deployment + repository + env vars + domain. Only the founder
   can execute the infra split; tell me the target and I'll prepare the
   migration/runbook.
3. **Apply migrations:** `20260608000000_julius.sql` (this PR) plus the four
   previously shipped migrations (`memories`, `agent_actions`, `learning_settings`,
   `learning_require_approval`).
4. **Julius next steps:** approve wiring `getJuliusContext` into agent flows and
   adding a Julius review surface under the company OS (`/harmony`).
