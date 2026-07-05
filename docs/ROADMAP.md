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
- **Provider clients (10)** on the runtime: GitHub, Slack, Notion, Linear, Discord, Jira, Google Drive, HubSpot, Gmail, Google Calendar.
- **Company Context Envelope** — 30-section company identity (config-only; no tokens).
- **Julius** — company brain: knowledge graph + reasoning + projections.
- **Ledger** — AI CFO: `FinancialSnapshot` (ARR/MRR/burn/runway/margin/LTV:CAC).
- **Digital Twin** — derivable operating model (organization/direction/connectors/finances/risks/health/graph).
- **Portable Workforce** — export/import a company's envelope + skills + Julius memory (secret-free).
- **Founder Experience** — Command Center, AI Workforce HQ, Executive/Explainability dashboard, uploads, branding, **executive chat redesign** (rich markdown, code blocks, tables, search, bookmarks).
- **Multi-Company OS core** — list/resolve companies for one founder.

### 🔵 NEW TOP PRIORITY — AIOS Marketplace
One universal marketplace over the runtime. Nine catalogs — Workforce, Skills,
Departments, Connectors, Workflows, Automations, Dashboards, Industry packs,
Company Templates — sharing ONE item model.
- **Shipped (engine, additive):** `src/lib/marketplace/` — versioning (semver), verification, ratings, dependencies (resolution + cycle/conflict/missing detection), install/update/rollback/uninstall **planning**, company-private + marketplace-public visibility.
- **Held (Founder gate — schema):** persistence tables + RLS + server actions (see `docs/marketplace/README.md`).

### 🔵 NEW TOP PRIORITY — Portable Company
Expand Portable Workforce into a whole **deployable company**.
- **Shipped (additive):** `src/lib/company/portable-company.ts` — `exportCompany` / `importCompany` composing envelope (branding, governance, policies, founder settings, departments, objectives, projects, dashboards, reports, connectors-as-config) + Julius memory + skills + Digital Twin + Ledger snapshot + marketplace-asset provisioning plan. Secret-free; connectors re-consent in the target.
- **Held:** full-fidelity writers for any sections lacking an import path today, and cross-instance transfer, land as their writers/migrations are approved.

### 🟡 In progress / continuing
- **Provider clients (remaining):** Google Docs/Sheets/Meet, Microsoft Outlook/Teams/OneDrive, Salesforce, Dropbox, Box, Browserbase, Stagehand — all inherit the Universal Runtime.
- **Multi-Company OS** — founder interface to operate multiple companies seamlessly.
- **Enterprise OS** — customer onboarding auto-provisions Company Context + Harmony + Julius + Ledger + Digital Twin + Workforce + Connector platform + Departments + Executive dashboards + Marketplace assets + Governance + Memory + Skills.
- **Digital Twin (expansion):** execution simulation, forecasting, operational + risk prediction, scenario analysis, strategic planning.
- **Ledger (expansion):** investor reporting, accounting integrations, cash forecasting, budget variance, executive reports.
- **Julius (expansion):** decision history, institutional best practices, semantic retrieval, relationship intelligence.
- **Founder Experience (continuing):** WorkerAvatar attribution, streaming, attachment previews, summary cards (gated items held).

---

## Layer‑1 (Founder-handled) — blocks live external validation only
`TOKEN_ENCRYPTION_KEY` in Vercel · provider OAuth apps (Google/Slack/HubSpot/…)
· redirect URIs. All runtime/provider/marketplace/portability code builds and is
CI-green without them.
