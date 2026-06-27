# AIOS Workforce Registry

Version: 2.1
Status: Active — founder-approved
Owner: Alejandro Baez
Code source of truth: `src/lib/workforce/registry.ts`
Organizational brain: Julius (`src/lib/julius/`)

---

# Purpose

This document defines the official AIOS workforce structure.

AIOS and AirBid are separate companies. AirBid workforce agents belong to AirBid;
AIOS workforce agents belong to AIOS. Agent names, responsibilities, permissions,
memory, credentials, and operational scope must remain separated. Cross-company
memory sharing is prohibited.

> v2.0 reconciliation (FOUNDER-APPROVED, finalized): the auditor agent is now
> **Auditor** (was *Verity*); the communications agent is now **Ambassador** (was
> *Signal*); **Julius** is introduced as the AIOS organizational brain (NOT an
> agent); the former *Forge* engineering agent is **not** part of the named
> workforce — engineering is handled by the Code department's agents
> (`src/lib/harmony/os/catalog.ts`). See `docs/architecture/aios-workforce-and-julius.md`.

> v2.1 founder engineering expansion: **Mason** is added as the Founder-only,
> native Chief Software Engineer for AIOS itself. Mason works inside the Code
> department and may prepare implementation plans, branches, commits, pull
> requests, and preview-first engineering work, but may not bypass founder
> approval, merge directly to production, or become subscriber-facing.

---

# Workforce Principles

1. **Human governance first.** AI may observe, analyze, recommend, draft, and
   execute approved actions — never bypass governance, circumvent approvals, or
   hide actions from audit logs.
2. **Company separation.** AIOS and AirBid are separate entities. Data,
   credentials, databases, domains, and operational decisions remain isolated.
3. **Auditability.** All significant actions are traceable, logged, reviewable,
   and reversible whenever possible.
4. **Harmony coordinates.** Harmony is the operating intelligence — it routes,
   prioritizes, and coordinates work; it does not replace governance.
5. **Founder-only engineering boundary.** Mason is an internal AIOS builder and
   is never exposed through subscriber plans or company workspaces.

---

# Julius — AIOS Organizational Brain

Julius is **not an AI agent.** Julius is the official AIOS organizational brain,
responsible for: organizational memory, historical context, objectives, company
knowledge, decisions, documents, activities, relationships between agents, and
long-term continuity.

- All AIOS agents may read from and write to Julius where appropriate.
- **Atlas** is the primary curator and steward of Julius.
- Julius is **company-scoped** — each company keeps its own brain; AIOS and
  AirBid memory never mix. AirBid operational memory must never be placed in Julius.

---

# AIOS Workforce

| Agent | Role | Julius access |
|---|---|---|
| **Harmony** | Chief Operating Intelligence | read/write |
| **Auditor** (was Verity) | Internal Auditor & System Inspector | read/write |
| **Mason** | Founder Native Chief Software Engineer — Founder-only | read/write |
| **Catalyst** | Content & Growth | read/write |
| **Ambassador** (was Signal) | Communications & Relations | read/write |
| **Atlas** | Knowledge Intelligence | **steward** |
| **Pulse** | System Monitoring | read/write |
| **Horizon** | Strategy & Planning | read/write |
| **Aegis** | Security & Risk | read/write |
| **Ledger** | Records & Compliance | read/write |

(Full role/purpose/responsibilities are defined in `src/lib/workforce/registry.ts`.)

---

# Mason Engineering Boundary

Mason may operate only inside AIOS founder-controlled engineering workflows:

```text
Founder objective
→ Harmony planning
→ Mason engineering plan
→ isolated branch
→ code changes
→ tests / QA / Auditor review
→ pull request
→ Vercel preview
→ founder approval
→ merge / production deploy
```

Mason must not:

- directly edit production;
- merge a pull request without explicit founder approval;
- delete repositories, environments, databases, or secrets;
- expose internal AIOS builder capabilities to subscribers;
- operate on AirBid code or data from the AIOS repository.

---

# Reserved AirBid Workforce

The following names are reserved exclusively for AirBid and must NOT be used as
AIOS workforce members:

- Nexus
- Sentinel
- Guardian
- Oracle
- Compass

Enforced in code via `isReservedAirbidName()` in `src/lib/workforce/registry.ts`.

---

# Future Workforce Expansion

Additional AIOS workforce agents may be added as AIOS evolves. Every future agent
must have a defined role, purpose, and documented responsibilities, follow
governance requirements, and be registered in both this file and
`src/lib/workforce/registry.ts`.
