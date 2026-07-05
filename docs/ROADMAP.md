# AIOS Platform — Roadmap

The AIOS vision: provision **autonomous companies** (Harmony + Julius + Ledger +
AI Workforce) on ONE Universal Capability Runtime, specialized per company by a
Company Context Envelope — multi-company, portable, self-improving, and
marketplace-extensible.

Governance is permanent. Autonomous execution proceeds continuously and only
stops for the gates: Founder approval · production-impacting schema changes ·
breaking architectural decisions · security concerns · required Layer‑1
provisioning · visible Founder UX previews. **Zero regressions.**

---

## Top-level milestones

### 🟢 Foundation (shipped / on `main`)
- **Universal Capability Runtime** — types, retry, capabilities, health, telemetry, governance `authorize` hook.
- **Provider clients (10):** GitHub, Slack, Notion, Linear, Discord, Jira, Google Drive, HubSpot, Gmail, Google Calendar.
- **Company Context Envelope** — 30-section identity (config-only; no tokens).
- **Julius** (company brain), **Ledger** (AI CFO), **Digital Twin** (derived operating model).
- **Founder Experience** — Command Center, AI Workforce HQ, Executive/Explainability dashboard, uploads, branding, executive chat (rich markdown, code, tables, search, bookmarks).
- **Multi-Company OS core.**

### 🔵 TOP PRIORITY — AIOS Marketplace
One universal marketplace over the runtime; **12 storefront categories** on ONE item model.
- **Shipped (engine + catalog, additive):** `src/lib/marketplace/` — 13 item kinds; the 12 categories (Company Templates, AI Departments, AI Workers, Skills, Connector Packs, Workflow Packs, Dashboard Packs, Industry Solutions, Branding Packs, Knowledge Packs, Founder Packs, Developer Tools); semver, verification, ratings, dependency resolution (cycle/conflict/missing), install/update/rollback/uninstall planning; company-private + public. **10 Company Templates** (`templates/`) that provision complete autonomous companies. 91 unit tests.
- **Held (Founder gate — schema):** persistence tables + RLS + server actions (see `docs/marketplace/README.md`).
- **Held (visible UX):** the Marketplace storefront + landing feature UI.

### 🔵 TOP PRIORITY — Portable Company
An entire autonomous company as a deployable package.
- **Shipped (additive):** `src/lib/company/portable-company.ts` — `exportCompany` / `importCompany` / **`backupCompany`** / **`cloneCompany`** / **`prepareDeployment`** (+ `hashBundle`, `validateBundle`). Bundles the full identity (envelope) + Julius memory + skills + Digital Twin + Ledger + marketplace-asset plan. Secret-free; connectors re-consent.
- **Held:** full-fidelity writers for envelope sections lacking an import path today; cross-instance transport orchestration.

### 🟡 Continuing
- **Provider clients (remaining):** Google Docs/Sheets/Meet, Microsoft Outlook/Teams/OneDrive, Salesforce, Dropbox, Box, Browserbase, Stagehand — inherit the runtime.
- **Landing page redesign** (Marketplace, Portable Company, Autonomous Provisioning, Company Templates) — **held preview** for Founder approval.
- **Multi-Company OS** founder interface · **Enterprise OS** auto-provisioning.
- **Digital Twin** (simulation/forecasting/risk/scenario/strategy), **Ledger** (investor reporting/accounting integrations/cash forecasting/variance/exec reports), **Julius** (decision history/best practices/semantic retrieval/relationship intelligence).

---

## Layer‑1 (Founder-handled) — blocks live external validation only
`TOKEN_ENCRYPTION_KEY` in Vercel · provider OAuth apps · redirect URIs. All
runtime/provider/marketplace/portability code builds and is CI-green without them.
